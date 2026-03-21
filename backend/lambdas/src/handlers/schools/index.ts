// Lambda entry point for pt-schools: /schools/*, /stats/*, /availability/*, /audit-log/*, /tutors/{uid}/slots

import { createRouter } from "../../shared/router.js";
import { registerSchool } from "./register-school.js";
import { addSchool } from "./add-school.js";
import { approveSchool } from "./approve-school.js";
import { rejectSchool } from "./reject-school.js";
import { removeSchool } from "./remove-school.js";
import { getSchool } from "./get-school.js";
import { listSchools } from "./list-schools.js";
import { getStats } from "./get-stats.js";
import { getAuditLog } from "./get-audit-log.js";
import { updateSchoolProfile } from "./update-school-profile.js";
import { getLogoUploadUrl } from "./get-logo-upload-url.js";
import { searchTutors } from "./search-tutors.js";
import {
  addAvailability,
  deleteAvailability,
  updateAvailability,
  cancelDate,
  uncancelDate,
  getTutorSlots,
} from "./availability-crud.js";

export const handler = createRouter({
  "POST /schools/register":                   registerSchool,
  "POST /schools/add":                        addSchool,
  "POST /schools/approve":                    approveSchool,
  "POST /schools/reject":                     rejectSchool,
  "POST /schools/remove":                     removeSchool,
  "PATCH /schools/{domain}/profile":          updateSchoolProfile,
  "POST /schools/{domain}/logo":              getLogoUploadUrl,
  "GET /schools/{domain}":                    getSchool,
  "GET /schools/{domain}/tutors":             searchTutors,
  "GET /schools":                             listSchools,
  "GET /stats/{domain}":                      getStats,
  "GET /audit-log/{domain}":                  getAuditLog,
  "POST /availability/add":                   addAvailability,
  "DELETE /availability/{slotId}":            deleteAvailability,
  "PATCH /availability/{slotId}":             updateAvailability,
  "POST /availability/{slotId}/cancel-date":  cancelDate,
  "POST /availability/{slotId}/uncancel-date": uncancelDate,
  "GET /tutors/{uid}/slots":                  getTutorSlots,
});
