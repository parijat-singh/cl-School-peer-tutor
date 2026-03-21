// Lambda entry point for pt-misc: /recommendations/* and /contact/* routes.

import { createRouter } from "../../shared/router.js";
import { recommendTutors } from "./recommend-tutors.js";
import { submitContactForm } from "./submit-contact-form.js";

export const handler = createRouter({
  "POST /recommendations/tutors": recommendTutors,
  "POST /contact/submit":         submitContactForm,
});
