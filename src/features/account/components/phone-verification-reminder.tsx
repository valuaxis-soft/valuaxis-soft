import { getCurrentUser } from "@/features/auth/session";
import { isPhoneVerificationEnabled, isPhoneVerificationRequired } from "../phone/phone-verification-provider";
import { needsPhoneReminder } from "../phone/phone-verification.service";
import { PhoneReminderBanner } from "./phone-reminder-banner";

/** The reminder of the private area: only with the provider configured and while the person's phone is not verified. */
export async function PhoneVerificationReminder() {
  if (!isPhoneVerificationEnabled()) return null;
  const user = await getCurrentUser();
  if (!user || !(await needsPhoneReminder(user.id))) return null;
  return <PhoneReminderBanner required={isPhoneVerificationRequired()} />;
}
