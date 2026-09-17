import type { Prisma } from '../../generated/prisma/client';

/**
 * Writes a user's new password, the same way whichever flow produced it.
 *
 * Invitation, reset code and change from the profile all end here, so they cannot drift apart on
 * what a password change means: the hash is replaced; the "choose your own password" requirement
 * is cleared; `tokenVersion` moves so every outstanding access token fails its next check; every
 * session is revoked; and every unused link or code is withdrawn, so an old reset email cannot be
 * used after the password has already been changed.
 */
export async function commitNewPassword(
  tx: Prisma.TransactionClient,
  userId: string,
  passwordHash: string,
  reason: 'PASSWORD_SETUP' | 'PASSWORD_RESET' | 'PASSWORD_CHANGE',
): Promise<{ tokenVersion: number; email: string; displayName: string }> {
  const now = new Date();
  const user = await tx.user.update({
    where: { id: userId },
    data: { passwordHash, passwordChangeRequired: false, tokenVersion: { increment: 1 } },
    select: { tokenVersion: true, email: true, displayName: true },
  });
  await tx.authSession.updateMany({
    where: { userId, status: 'ACTIVE' },
    data: { status: 'REVOKED', revokedAt: now, revocationReason: reason },
  });
  await tx.passwordResetToken.updateMany({
    where: { userId, usedAt: null, revokedAt: null },
    data: { revokedAt: now },
  });
  return user;
}

/** The rule every new password meets, stated once for every flow and its error message. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
