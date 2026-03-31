/**
 * PeerTutor — Full Test-Bed Seed Script
 *
 * Creates:
 *   • 1 super admin
 *   • 5 schools
 *   • 1–3 school admins per school
 *   • 5 tutors per school
 *   • 10 tutees per school
 *   • 2 combo (tutor+tutee) users per school
 *   • 3–5 availability slots per tutor / combo-as-tutor
 *   • 2 scheduled sessions per tutee / combo-as-tutee
 *
 * All passwords: Test1234!
 */

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

// ── Config ────────────────────────────────────────────────────
const REGION        = "us-east-1";
const USER_POOL_ID  = "us-east-1_QUDvlqnZV";
const PASSWORD      = "Test1234!";

const Tables = {
  Users:             "peertutor-users",
  Schools:           "peertutor-schools",
  AvailabilitySlots: "peertutor-availability-slots",
  Sessions:          "peertutor-sessions",
  Stats:             "peertutor-stats",
};

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Helpers ───────────────────────────────────────────────────
let created = { users: 0, slots: 0, sessions: 0 };
let errors  = [];

function log(msg) { process.stdout.write(msg + "\n"); }
function tick(label) { process.stdout.write(`  ✓ ${label}\n`); }

async function createCognitoUser(email, role, schoolDomain) {
  try {
    const res = await cognito.send(new AdminCreateUserCommand({
      UserPoolId:    USER_POOL_ID,
      Username:      email,
      MessageAction: "SUPPRESS",
      UserAttributes: [
        { Name: "email",                  Value: email },
        { Name: "email_verified",         Value: "true" },
        { Name: "custom:role",            Value: role },
        { Name: "custom:schoolDomain",    Value: schoolDomain ?? "" },
        { Name: "custom:status",          Value: "active" },
      ],
    }));

    const uid = res.User.Attributes.find(a => a.Name === "sub").Value;

    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username:   email,
      Password:   PASSWORD,
      Permanent:  true,
    }));

    created.users++;
    return uid;
  } catch (err) {
    if (err.name === "UsernameExistsException") {
      // Return existing user's sub
      const { CognitoIdentityProviderClient: C, AdminGetUserCommand } =
        await import("@aws-sdk/client-cognito-identity-provider");
      const c2 = new C({ region: REGION });
      const u = await c2.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: email }));
      const uid = u.UserAttributes.find(a => a.Name === "sub").Value;
      // Update attributes in case role changed
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username:   email,
        UserAttributes: [
          { Name: "custom:role",         Value: role },
          { Name: "custom:schoolDomain", Value: schoolDomain ?? "" },
          { Name: "custom:status",       Value: "active" },
        ],
      }));
      await cognito.send(new AdminSetUserPasswordCommand({
        UserPoolId: USER_POOL_ID,
        Username:   email,
        Password:   PASSWORD,
        Permanent:  true,
      }));
      return uid;
    }
    errors.push(`Cognito create ${email}: ${err.message}`);
    return null;
  }
}

async function putUser(item) {
  await ddb.send(new PutCommand({ TableName: Tables.Users, Item: item }));
}

async function putSchool(item) {
  await ddb.send(new PutCommand({ TableName: Tables.Schools, Item: item }));
}

async function putSlot(item) {
  await ddb.send(new PutCommand({ TableName: Tables.AvailabilitySlots, Item: item }));
  created.slots++;
}

async function putSession(item) {
  await ddb.send(new PutCommand({ TableName: Tables.Sessions, Item: item }));
  created.sessions++;
}

const NOW = new Date().toISOString();

function isoDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const DAYS  = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const TIMES = [
  ["09:00", "10:00"], ["10:00", "11:00"], ["11:00", "12:00"],
  ["13:00", "14:00"], ["14:00", "15:00"], ["15:00", "16:00"],
  ["16:00", "17:00"],
];

// ── School definitions ────────────────────────────────────────
const SCHOOLS = [
  {
    domain: "lincoln.edu",
    name: "Lincoln High School",
    type: "high",
    brandColor: "#1D4ED8",
    subjects: ["Algebra", "Biology", "Chemistry", "English", "History", "Physics", "Calculus"],
  },
  {
    domain: "jefferson.edu",
    name: "Jefferson Academy",
    type: "high",
    brandColor: "#059669",
    subjects: ["Algebra", "Biology", "Spanish", "English", "Computer Science", "Economics"],
  },
  {
    domain: "roosevelt.edu",
    name: "Roosevelt High School",
    type: "high",
    brandColor: "#DC2626",
    subjects: ["Algebra", "Chemistry", "History", "English", "Physics", "Art"],
  },
  {
    domain: "washingtonprep.edu",
    name: "Washington Preparatory",
    type: "k12",
    brandColor: "#7C3AED",
    subjects: ["Algebra", "Biology", "English", "French", "Geography", "Music"],
  },
  {
    domain: "madison.edu",
    name: "Madison High School",
    type: "high",
    brandColor: "#D97706",
    subjects: ["Algebra", "Chemistry", "English", "Physics", "Computer Science", "Psychology"],
  },
];

const FIRST_NAMES = [
  "Alex","Jordan","Morgan","Taylor","Riley","Casey","Drew","Avery","Quinn","Blake",
  "Skylar","Peyton","Hayden","Cameron","Logan","Spencer","Reese","Emery","Parker","Sawyer",
  "Finley","Rowan","Elliot","Harley","Dakota","Sage","River","Phoenix","Sloane","Remy",
  "Evelyn","Marcus","Priya","Kenji","Sofia","Kwame","Aisha","Luca","Mei","Omar",
  "Yuki","Amir","Nadia","Darius","Zara","Tobias","Celeste","Ezra","Layla","Mateo",
];
const LAST_NAMES = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Wilson","Moore",
  "Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Young","King",
];

let nameIdx = 0;
function nextName() {
  const fn = FIRST_NAMES[nameIdx % FIRST_NAMES.length];
  const ln = LAST_NAMES[Math.floor(nameIdx / FIRST_NAMES.length) % LAST_NAMES.length];
  nameIdx++;
  return `${fn} ${ln}`;
}

const BIOS = [
  "Top student with a passion for teaching peers.",
  "Honor roll student, loves breaking down hard concepts.",
  "Patient and thorough — specialises in exam prep.",
  "Senior student with 2 years of peer tutoring experience.",
  "Enthusiastic about helping classmates reach their potential.",
];

// ── Main ──────────────────────────────────────────────────────
log("\n══════════════════════════════════════════════════════════");
log("  PeerTutor — Test-Bed Seed Script");
log("══════════════════════════════════════════════════════════\n");

// ── 1. Super Admin ────────────────────────────────────────────
log("👑 SUPER ADMIN");
const saEmail = "superadmin@peertutor.app";
const saUid = await createCognitoUser(saEmail, "superadmin", "peertutor.app");
if (saUid) {
  await putUser({
    uid: saUid, name: "Super Admin", email: saEmail,
    role: "superadmin", schoolDomain: "peertutor.app", grade: null,
    status: "active", subjects: [], createdAt: NOW, updatedAt: NOW,
  });
  tick(`${saEmail}  (password: ${PASSWORD})`);
}

// ── 2. Schools + per-school users ────────────────────────────
for (const school of SCHOOLS) {
  log(`\n🏫 ${school.name.toUpperCase()} (${school.domain})`);

  // Seed school doc
  await putSchool({
    domain: school.domain,
    name: school.name,
    type: school.type,
    approved: true,
    status: "active",
    brandColor: school.brandColor,
    subjects: school.subjects,
    createdAt: NOW,
  });

  const tutorUids   = [];  // {uid, name, subjects}
  const tuteeUids   = [];  // {uid, name}
  let   slotCounter = 0;

  // ── 2a. School admins (2 per school) ──────────────────────
  log("  📋 Admins");
  const numAdmins = 2;
  for (let i = 0; i < numAdmins; i++) {
    const name  = nextName();
    const email = `admin${i + 1}.${school.domain.replace(".edu", "")}@${school.domain}`;
    const uid   = await createCognitoUser(email, "schooladmin", school.domain);
    if (uid) {
      await putUser({
        uid, name, email,
        role: "schooladmin", schoolDomain: school.domain, grade: null,
        status: "active", subjects: [], createdAt: NOW, updatedAt: NOW,
      });
      tick(`${email}`);
    }
  }

  // ── 2b. Tutors (5 per school) ──────────────────────────────
  log("  🎓 Tutors");
  for (let i = 0; i < 5; i++) {
    const name     = nextName();
    const email    = `tutor${i + 1}.${school.domain.replace(".edu", "")}@${school.domain}`;
    const subjects = school.subjects.slice(0, 3 + (i % 3));  // 3–5 subjects
    const uid      = await createCognitoUser(email, "tutor", school.domain);
    if (!uid) continue;

    await putUser({
      uid, name, email,
      role: "tutor", schoolDomain: school.domain, grade: null,
      status: "active", subjects,
      bio: BIOS[i % BIOS.length],
      avgRating: parseFloat((3.8 + Math.random() * 1.2).toFixed(1)),
      reviewCount: Math.floor(Math.random() * 20) + 3,
      isActive: true,
      createdAt: NOW, updatedAt: NOW,
    });
    tick(`${email} — subjects: ${subjects.join(", ")}`);

    tutorUids.push({ uid, name, subjects });

    // 3–5 slots per tutor
    const numSlots = 3 + (i % 3);
    for (let s = 0; s < numSlots; s++) {
      const day       = DAYS[(slotCounter + s) % DAYS.length];
      const [st, et]  = TIMES[(slotCounter + s) % TIMES.length];
      await putSlot({
        tutorId: uid,
        slotId:  `slot-${uid.slice(0, 8)}-${s}`,
        recurring: true,
        day, startTime: st, endTime: et,
        duration: 60,
        booked: false,
      });
    }
    slotCounter += 5;
  }

  // ── 2c. Tutees (10 per school) ────────────────────────────
  log("  📚 Tutees");
  const grades = ["9th","10th","11th","12th","9th","10th","11th","12th","9th","10th"];
  for (let i = 0; i < 10; i++) {
    const name  = nextName();
    const email = `tutee${i + 1}.${school.domain.replace(".edu", "")}@${school.domain}`;
    const grade = grades[i];
    const uid   = await createCognitoUser(email, "tutee", school.domain);
    if (!uid) continue;

    await putUser({
      uid, name, email,
      role: "tutee", schoolDomain: school.domain, grade,
      status: "active", subjects: [], createdAt: NOW, updatedAt: NOW,
    });
    tick(`${email} — grade ${grade}`);
    tuteeUids.push({ uid, name });

    // 2 scheduled sessions per tutee
    for (let s = 0; s < 2; s++) {
      const tutor   = tutorUids[(i + s) % tutorUids.length];
      const subject = tutor.subjects[s % tutor.subjects.length];
      const day     = DAYS[s % DAYS.length];
      const [st, et] = TIMES[s % TIMES.length];
      const dateOffset = 3 + (i * 2) + s;  // spread sessions across upcoming days
      await putSession({
        sessionId:     randomUUID(),
        tutorId:       tutor.uid,
        tuteeId:       uid,
        tutorName:     tutor.name,
        tuteeName:     name,
        subject,
        slotId:        `slot-${tutor.uid.slice(0, 8)}-${s}`,
        day,
        startTime:     st,
        endTime:       et,
        duration:      60,
        scheduledDate: isoDate(dateOffset),
        status:        "scheduled",
        meetLinkStatus: "pending",
        schoolDomain:  school.domain,
        tutorRated:    false,
        tuteeRated:    false,
        createdAt:     NOW,
      });
    }
  }

  // ── 2d. Combo users (2 per school) ───────────────────────
  log("  🔄 Combos (tutor+tutee)");
  for (let i = 0; i < 2; i++) {
    const name     = nextName();
    const email    = `combo${i + 1}.${school.domain.replace(".edu", "")}@${school.domain}`;
    const subjects = school.subjects.slice(1, 3);
    const uid      = await createCognitoUser(email, "both", school.domain);
    if (!uid) continue;

    await putUser({
      uid, name, email,
      role: "both", schoolDomain: school.domain, grade: "11th",
      status: "active", subjects,
      bio: "I tutor and get tutored — love the peer learning community!",
      avgRating: parseFloat((3.9 + Math.random() * 0.8).toFixed(1)),
      reviewCount: Math.floor(Math.random() * 10) + 1,
      isActive: true,
      createdAt: NOW, updatedAt: NOW,
    });
    tick(`${email} — subjects: ${subjects.join(", ")}`);

    // 3 slots as tutor
    for (let s = 0; s < 3; s++) {
      const day      = DAYS[(slotCounter + s + 2) % DAYS.length];
      const [st, et] = TIMES[(slotCounter + s + 3) % TIMES.length];
      await putSlot({
        tutorId: uid,
        slotId:  `slot-${uid.slice(0, 8)}-${s}`,
        recurring: true,
        day, startTime: st, endTime: et,
        duration: 60,
        booked: false,
      });
    }
    slotCounter += 3;

    // 2 sessions as tutee
    for (let s = 0; s < 2; s++) {
      const tutor   = tutorUids[s % tutorUids.length];
      const subject = tutor.subjects[0];
      const day     = DAYS[(s + 2) % DAYS.length];
      const [st, et] = TIMES[(s + 4) % TIMES.length];
      await putSession({
        sessionId:     randomUUID(),
        tutorId:       tutor.uid,
        tuteeId:       uid,
        tutorName:     tutor.name,
        tuteeName:     name,
        subject,
        slotId:        `slot-${tutor.uid.slice(0, 8)}-0`,
        day,
        startTime:     st,
        endTime:       et,
        duration:      60,
        scheduledDate: isoDate(5 + i + s),
        status:        "scheduled",
        meetLinkStatus: "pending",
        schoolDomain:  school.domain,
        tutorRated:    false,
        tuteeRated:    false,
        createdAt:     NOW,
      });
    }
  }

  log(`\n  ✅ ${school.name} complete`);
}

// ── Summary ───────────────────────────────────────────────────
log("\n══════════════════════════════════════════════════════════");
log("  SEED COMPLETE");
log(`  Users created/updated : ${created.users}`);
log(`  Availability slots    : ${created.slots}`);
log(`  Sessions scheduled    : ${created.sessions}`);
if (errors.length > 0) {
  log(`\n  ⚠️  Errors (${errors.length}):`);
  errors.forEach(e => log(`    • ${e}`));
}
log("══════════════════════════════════════════════════════════");
log("\n📋 ACCOUNT SUMMARY");
log(`  Password for ALL accounts: ${PASSWORD}\n`);
log("  SUPER ADMIN:");
log("    superadmin@peertutor.app\n");
log("  PER SCHOOL (replace <school> with: lincoln / jefferson / roosevelt / washingtonprep / madison):");
log("    admin1.<school>@<school>.edu");
log("    admin2.<school>@<school>.edu");
log("    tutor1.<school>@<school>.edu  …  tutor5.<school>@<school>.edu");
log("    tutee1.<school>@<school>.edu  …  tutee10.<school>@<school>.edu");
log("    combo1.<school>@<school>.edu");
log("    combo2.<school>@<school>.edu");
log("");
