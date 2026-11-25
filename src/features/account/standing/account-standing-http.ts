import { NextResponse } from "next/server";
import { ACCOUNT_SUSPENDED_CODE, suspendedMessage } from "./account-standing-rules";
import { getAccountStanding } from "./account-standing.service";

/**
 * For the routes that create, duplicate or conclude a valuation: a 403 with
 * the reason while the account is suspended or disabled (Terms 14.1: the
 * suspension stops making and concluding valuations, never consulting or
 * downloading the concluded ones); null when the person may go on.
 */
export async function accountSuspendedResponse(userId: number) {
  const standing = await getAccountStanding(userId);
  if (standing.canProduce) return null;
  return NextResponse.json(
    { error: suspendedMessage(standing.restriction), code: ACCOUNT_SUSPENDED_CODE, link: "/cuenta#baja" },
    { status: 403 },
  );
}
