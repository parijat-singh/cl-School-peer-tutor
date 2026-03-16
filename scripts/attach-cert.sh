#!/usr/bin/env bash
# =============================================================================
# Waits for the ACM certificate to be issued, then updates the CloudFront
# distribution to use schoolpeertutor.com with HTTPS.
#
# Run this after updating GoDaddy nameservers to Route 53.
# Usage: bash scripts/attach-cert.sh
# =============================================================================
set -euo pipefail

AWS="/c/Program Files/Amazon/AWSCLIV2/aws.exe"
PROFILE="schoolpeertutor"
CERT_ARN="arn:aws:acm:us-east-1:877643141603:certificate/ebeb9d6a-8865-44d8-a198-eaab01a37b32"
DIST_ID="E348UFZNGBKEPO"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}Waiting for ACM certificate to be issued...${NC}"
echo "(This requires GoDaddy nameservers to be updated to Route 53)"
echo ""

while true; do
  STATUS=$("$AWS" acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region us-east-1 \
    --profile "$PROFILE" \
    --query 'Certificate.Status' --output text 2>/dev/null)

  echo -e "$(date '+%H:%M:%S') Certificate status: ${YELLOW}${STATUS}${NC}"

  if [ "$STATUS" = "ISSUED" ]; then
    echo -e "${GREEN}Certificate issued! Updating CloudFront distribution...${NC}"
    break
  elif [ "$STATUS" = "FAILED" ]; then
    echo -e "${RED}Certificate validation FAILED. Check GoDaddy DNS records.${NC}"
    exit 1
  fi

  sleep 30
done

# Get current distribution config and ETag (required for updates)
ETAG=$("$AWS" cloudfront get-distribution-config \
  --id "$DIST_ID" \
  --profile "$PROFILE" \
  --query 'ETag' --output text)

CONFIG=$("$AWS" cloudfront get-distribution-config \
  --id "$DIST_ID" \
  --profile "$PROFILE" \
  --query 'DistributionConfig')

# Update: add custom domains + ACM certificate
UPDATED=$(echo "$CONFIG" | python3 -c "
import sys, json
cfg = json.load(sys.stdin)
cfg['Aliases'] = {'Quantity': 2, 'Items': ['schoolpeertutor.com', 'www.schoolpeertutor.com']}
cfg['ViewerCertificate'] = {
    'ACMCertificateArn': '${CERT_ARN}',
    'SSLSupportMethod': 'sni-only',
    'MinimumProtocolVersion': 'TLSv1.2_2021',
    'Certificate': '${CERT_ARN}',
    'CertificateSource': 'acm'
}
print(json.dumps(cfg))
")

"$AWS" cloudfront update-distribution \
  --id "$DIST_ID" \
  --distribution-config "$UPDATED" \
  --if-match "$ETAG" \
  --profile "$PROFILE" \
  --query 'Distribution.Status' --output text

echo -e "${GREEN}CloudFront updated with custom domain + HTTPS certificate ✅${NC}"
echo "schoolpeertutor.com and www.schoolpeertutor.com are now configured."
echo ""
echo "CloudFront is deploying globally (~5 min). You'll then be able to deploy the frontend."
