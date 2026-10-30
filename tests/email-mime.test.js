import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

function decodePart(value, encoding) {
  if (encoding === 'base64') return Buffer.from(value.replace(/\s/g, ''), 'base64').toString('utf8');
  if (encoding === 'quoted-printable') {
    return Buffer.from(value.replace(/=\r?\n/g, '').replace(/=([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8');
  }
  return value;
}

function mimeParts(message) {
  const boundary = message.match(/boundary="([^"]+)"/i)?.[1];
  assert.ok(boundary, 'both HTML and plain text should be included');
  return message.split('--' + boundary).slice(1, -1).map(part => {
    const [headers, ...body] = part.replace(/^\r\n/, '').split('\r\n\r\n');
    const encoding = headers.match(/Content-Transfer-Encoding: ([^\r\n]+)/i)?.[1].toLowerCase();
    return { type: headers.match(/Content-Type: ([^;\r\n]+)/i)?.[1], text: decodePart(body.join('\r\n\r\n').replace(/\r\n$/, ''), encoding) };
  });
}

test('SMTP sender builds report and OTP MIME offline with correct recipients, UTF-8 and safe headers', async t => {
  const savedEnv = { user: process.env.GMAIL_NOREPLY_USER, pass: process.env.GMAIL_NOREPLY_PASS };
  process.env.GMAIL_NOREPLY_USER = 'bot@example.invalid';
  process.env.GMAIL_NOREPLY_PASS = 'offline-fixture-only';
  const built = [];
  // The real MailComposer is used, but this transport only returns a Buffer.
  // No SMTP server, Gmail API, or recipient is contacted by this test.
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' });
  t.mock.method(nodemailer, 'createTransport', options => {
    assert.equal(options.host, 'smtp.gmail.com');
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.equal(options.auth.user, 'bot@example.invalid');
    return { sendMail: async message => {
      const result = await stream.sendMail(message);
      built.push(result);
      return result;
    } };
  });
  try {
    const { sendMail, reportEmail } = await import('../api/lib/email.js?mime-offline');
    for (const kind of ['auto', 'share']) {
      const report = reportEmail({
        title: 'Reunión: José & Zoë', whenText: '30 de octubre', kind,
        summary: 'Decisión: revisión de costos y próximos pasos. 日本語',
        actionItems: [{ task: 'Enviar la propuesta mañana', owner: 'Nicolás' }],
        chapters: [{ title: 'Planificación', points: ['Revisar café y té'] }],
        viewUrl: 'https://meet.example.invalid/?share=fixture-token',
      });
      const response = await sendMail({ ...report, to: ['recipient@example.invalid', 'second@example.invalid'], fromName: 'Santiago vía OctoMeet', replyTo: 'owner@example.invalid' });
      assert.equal(response.ok, true);
      assert.equal(response.sent, 2);
      const info = built.at(-1);
      assert.deepEqual(info.envelope, { from: 'bot@example.invalid', to: ['recipient@example.invalid', 'second@example.invalid'] });
      const raw = info.message.toString('utf8');
      assert.match(raw, /^Reply-To: owner@example\.invalid\r?$/m);
      assert.match(raw, /^Subject: =\?UTF-8\?[BQ]\?/mi);
      const parts = mimeParts(raw);
      const normalizeLines = value => value?.replace(/\r\n/g, '\n');
      assert.equal(normalizeLines(parts.find(part => part.type === 'text/plain')?.text), normalizeLines(report.text));
      assert.equal(normalizeLines(parts.find(part => part.type === 'text/html')?.text), normalizeLines(report.html));
    }

    const otp = await sendMail({
      to: 'recipient@example.invalid', fromName: 'OctoMeet AI',
      subject: 'Código 123456\r\nBcc: intruder@example.invalid',
      text: 'Tu código es 123456. Válido por 10 minutos.',
      html: '<p>Tu código es <strong>123456</strong>.</p>',
    });
    assert.equal(otp.ok, true);
    assert.deepEqual(built.at(-1).envelope.to, ['recipient@example.invalid']);
    assert.doesNotMatch(built.at(-1).message.toString('utf8'), /^Bcc:/mi);
    assert.equal(built.length, 3);
  } finally {
    stream.close();
    if (savedEnv.user === undefined) delete process.env.GMAIL_NOREPLY_USER; else process.env.GMAIL_NOREPLY_USER = savedEnv.user;
    if (savedEnv.pass === undefined) delete process.env.GMAIL_NOREPLY_PASS; else process.env.GMAIL_NOREPLY_PASS = savedEnv.pass;
  }
});
