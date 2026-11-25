/**
 * How to pay by transfer or cash deposit (commercial policies, section 5.1).
 * The owner has not given these data yet: until he does, every field is null
 * and the page says «Por definir» instead of inventing an account. To publish
 * them, fill the fields and deploy; nothing else changes.
 */
export type BankTransferInstructions = {
  bank: string | null;
  /** 18 digits. */
  clabe: string | null;
  holder: string | null;
  /** How long after the payment is confirmed the Avalúos Disponibles are credited («2 días hábiles»). */
  creditTerm: string | null;
  /** Where the payer sends the receipt, with the name of the firm. */
  receiptsEmail: string | null;
};

export const BANK_TRANSFER: BankTransferInstructions = {
  bank: null,
  clabe: null,
  holder: null,
  creditTerm: null,
  receiptsEmail: null,
};

/** Shown in place of a field the owner has not filled. */
export const PENDING_FIELD = "Por definir";

/** The instructions with every missing field marked, and whether they are complete enough to pay. */
export function bankTransferForDisplay(instructions: BankTransferInstructions = BANK_TRANSFER) {
  const ready = Boolean(instructions.bank && instructions.clabe && instructions.holder && instructions.creditTerm && instructions.receiptsEmail);
  return {
    ready,
    rows: [
      { label: "Banco", value: instructions.bank ?? PENDING_FIELD },
      { label: "Cuenta CLABE", value: instructions.clabe ?? PENDING_FIELD },
      { label: "Titular", value: instructions.holder ?? PENDING_FIELD },
      { label: "Se abona a tu saldo", value: instructions.creditTerm ? `Dentro de ${instructions.creditTerm} siguientes a que se confirme el pago` : PENDING_FIELD },
      { label: "Envía tu comprobante a", value: instructions.receiptsEmail ?? PENDING_FIELD },
    ],
  };
}
