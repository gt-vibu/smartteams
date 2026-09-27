/**
 * The messages Smarteam sends, as plain functions of their content.
 *
 * Each returns a subject, a plain-text body (what many clients and every screen reader rely on)
 * and HTML. Every value that came from a person — a name, an organization — is escaped before it
 * reaches HTML, so a display name cannot inject markup into someone else's inbox.
 */

export type MailMessage = { to: string; subject: string; text: string; html: string };

const escape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function layout(heading: string, paragraphs: string[], action?: { label: string; url: string }) {
  const button = action
    ? `<p style="margin:24px 0"><a href="${escape(action.url)}" style="background:#1f6b45;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escape(action.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f6f4;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#15191b">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="background:#ffffff;border:1px solid #dde3de;border-radius:12px;padding:28px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#55615b">Smarteam</p>
<h1 style="margin:0 0 16px;font-size:20px">${escape(heading)}</h1>
${paragraphs.map((line) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.55">${line}</p>`).join('\n')}
${button}
</div>
<p style="margin:16px 0 0;font-size:12px;color:#7d8a83">If you did not expect this email, you can ignore it.</p>
</div></body></html>`;
}

const code = (value: string) =>
  `<code style="font-family:Consolas,monospace;font-size:15px;background:#eef2ee;padding:3px 8px;border-radius:4px">${escape(value)}</code>`;

/** A new login: the address, the temporary password, and the link to choose a permanent one. */
export function invitationMail(input: {
  to: string;
  displayName: string;
  organizationName: string;
  temporaryPassword: string;
  setupUrl: string;
  expiresInHours: number;
}): MailMessage {
  const subject = `Your Smarteam account for ${input.organizationName}`;
  const text = [
    `Hello ${input.displayName},`,
    '',
    `An account has been created for you at ${input.organizationName}.`,
    '',
    `Email: ${input.to}`,
    `Temporary password: ${input.temporaryPassword}`,
    '',
    `Choose your own password here (valid for ${input.expiresInHours} hours):`,
    input.setupUrl,
    '',
    'You can also sign in with the temporary password; you will be asked to choose your own before anything else.',
  ].join('\n');
  const html = layout(
    `Welcome to ${input.organizationName}`,
    [
      `Hello ${escape(input.displayName)}, an account has been created for you.`,
      `Email: ${code(input.to)}`,
      `Temporary password: ${code(input.temporaryPassword)}`,
      `Use the button to choose your own password. The link works once, for ${input.expiresInHours} hours.`,
    ],
    { label: 'Set your password', url: input.setupUrl },
  );
  return { to: input.to, subject, text, html };
}

/** A password-reset code. */
export function resetCodeMail(input: {
  to: string;
  displayName: string;
  code: string;
  expiresInMinutes: number;
}): MailMessage {
  const subject = 'Your Smarteam password reset code';
  const text = [
    `Hello ${input.displayName},`,
    '',
    `Your password reset code is ${input.code}.`,
    `It expires in ${input.expiresInMinutes} minutes. Nobody from Smarteam will ever ask you for it.`,
  ].join('\n');
  const html = layout('Reset your password', [
    `Hello ${escape(input.displayName)}, use this code to reset your password:`,
    code(input.code),
    `It expires in ${input.expiresInMinutes} minutes. Nobody from Smarteam will ever ask you for it.`,
  ]);
  return { to: input.to, subject, text, html };
}

/** Sent whenever a password changes, so an unexpected change is noticed. */
export function passwordChangedMail(input: { to: string; displayName: string }): MailMessage {
  const subject = 'Your Smarteam password was changed';
  const text = [
    `Hello ${input.displayName},`,
    '',
    'The password for your Smarteam account was just changed, and you were signed out everywhere else.',
    'If this was not you, reset your password straight away and tell your administrator.',
  ].join('\n');
  const html = layout('Your password was changed', [
    `Hello ${escape(input.displayName)}, the password for your Smarteam account was just changed, and you were signed out everywhere else.`,
    'If this was not you, reset your password straight away and tell your administrator.',
  ]);
  return { to: input.to, subject, text, html };
}

/** An in-app notification, also sent by email: what happened, and a link to where it is. */
export function notificationMail(input: {
  to: string;
  displayName: string;
  organizationName: string;
  title: string;
  body: string;
  url: string;
}): MailMessage {
  const subject = `${input.title} · ${input.organizationName}`;
  const text = [
    `Hello ${input.displayName},`,
    '',
    input.body,
    '',
    `Open Smarteam: ${input.url}`,
    '',
    'You can turn these emails off from the notifications panel in Smarteam.',
  ].join('\n');
  const html = layout(
    input.title,
    [
      `Hello ${escape(input.displayName)},`,
      escape(input.body),
      `<span style="color:#55615b;font-size:12px">${escape(input.organizationName)} · turn these emails off from the notifications panel.</span>`,
    ],
    { label: 'Open in Smarteam', url: input.url },
  );
  return { to: input.to, subject, text, html };
}
