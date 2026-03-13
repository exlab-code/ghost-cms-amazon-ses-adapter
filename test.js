/**
 * Tests for the recipient variable substitution feature
 */

// Extract the function for testing (copy since it's not exported)
function replaceRecipientVariables(content, recipientEmail, recipientVarsMap) {
  if (!content || !recipientVarsMap || !recipientVarsMap[recipientEmail]) {
    return content;
  }
  const vars = recipientVarsMap[recipientEmail];
  return content.replace(/%recipient\.([^%]+)%/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

let passed = 0;
let failed = 0;

function assert(name, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    console.log(`    expected: ${JSON.stringify(expected)}`);
    console.log(`    actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('replaceRecipientVariables:');

const varsMap = {
  'alice@example.com': { first: 'Alice', last: 'Smith', unsubscribe_url: 'https://example.com/unsub/alice' },
  'bob@example.com': { first: 'Bob', last: 'Jones', unsubscribe_url: 'https://example.com/unsub/bob' }
};

// Basic substitution
assert('substitutes first name for alice',
  replaceRecipientVariables('Hello %recipient.first%!', 'alice@example.com', varsMap),
  'Hello Alice!'
);

assert('substitutes first name for bob',
  replaceRecipientVariables('Hello %recipient.first%!', 'bob@example.com', varsMap),
  'Hello Bob!'
);

// Multiple variables in one string
assert('substitutes multiple variables',
  replaceRecipientVariables('%recipient.first% %recipient.last%', 'alice@example.com', varsMap),
  'Alice Smith'
);

// URL substitution (common Ghost use case: unsubscribe links)
assert('substitutes URL variables',
  replaceRecipientVariables('<a href="%recipient.unsubscribe_url%">Unsubscribe</a>', 'alice@example.com', varsMap),
  '<a href="https://example.com/unsub/alice">Unsubscribe</a>'
);

// Unknown variable left as-is
assert('leaves unknown variables unchanged',
  replaceRecipientVariables('Hello %recipient.unknown%', 'alice@example.com', varsMap),
  'Hello %recipient.unknown%'
);

// Unknown recipient returns content unchanged
assert('unknown recipient returns content as-is',
  replaceRecipientVariables('Hello %recipient.first%', 'unknown@example.com', varsMap),
  'Hello %recipient.first%'
);

// Null/empty content
assert('null content returns null', replaceRecipientVariables(null, 'alice@example.com', varsMap), null);
assert('empty string returns empty string', replaceRecipientVariables('', 'alice@example.com', varsMap), '');

// No vars map
assert('null varsMap returns content', replaceRecipientVariables('Hello %recipient.first%', 'alice@example.com', null), 'Hello %recipient.first%');
assert('empty varsMap returns content', replaceRecipientVariables('Hello %recipient.first%', 'alice@example.com', {}), 'Hello %recipient.first%');

// Content with no variables
assert('content without variables unchanged', replaceRecipientVariables('Hello World!', 'alice@example.com', varsMap), 'Hello World!');

// Variable with value of empty string
const varsWithEmpty = { 'test@example.com': { first: '' } };
assert('empty string value replaces correctly',
  replaceRecipientVariables('Hello %recipient.first%!', 'test@example.com', varsWithEmpty),
  'Hello !'
);

// ==========================================
// All 13 Ghost recipient variables
// ==========================================
console.log('\nAll 13 Ghost recipient variables:');

const ghostVarsMap = {
  'member@example.com': {
    unsubscribe_url: 'https://blog.example.com/unsubscribe/?uuid=abc-123&newsletter=weekly',
    manage_account_url: 'https://blog.example.com/#/portal/account',
    uuid: 'abc-123-def-456',
    key: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    first_name: 'Jane',
    name: 'Jane Doe',
    name_class: '',
    email: 'member@example.com',
    created_at: '13 March 2026',
    status: 'paid',
    status_text: 'Your subscription renews on 1 April 2026',
    list_unsubscribe: 'https://blog.example.com/unsubscribe/?uuid=abc-123&newsletter=weekly',
    uniqueid: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  }
};

// Test each variable individually
assert('unsubscribe_url',
  replaceRecipientVariables('%recipient.unsubscribe_url%', 'member@example.com', ghostVarsMap),
  'https://blog.example.com/unsubscribe/?uuid=abc-123&newsletter=weekly'
);
assert('manage_account_url',
  replaceRecipientVariables('%recipient.manage_account_url%', 'member@example.com', ghostVarsMap),
  'https://blog.example.com/#/portal/account'
);
assert('uuid',
  replaceRecipientVariables('%recipient.uuid%', 'member@example.com', ghostVarsMap),
  'abc-123-def-456'
);
assert('key (HMAC)',
  replaceRecipientVariables('%recipient.key%', 'member@example.com', ghostVarsMap),
  'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
);
assert('first_name',
  replaceRecipientVariables('%recipient.first_name%', 'member@example.com', ghostVarsMap),
  'Jane'
);
assert('name',
  replaceRecipientVariables('%recipient.name%', 'member@example.com', ghostVarsMap),
  'Jane Doe'
);
assert('name_class (empty = has name)',
  replaceRecipientVariables('class="%recipient.name_class%"', 'member@example.com', ghostVarsMap),
  'class=""'
);
assert('email',
  replaceRecipientVariables('%recipient.email%', 'member@example.com', ghostVarsMap),
  'member@example.com'
);
assert('created_at',
  replaceRecipientVariables('%recipient.created_at%', 'member@example.com', ghostVarsMap),
  '13 March 2026'
);
assert('status',
  replaceRecipientVariables('%recipient.status%', 'member@example.com', ghostVarsMap),
  'paid'
);
assert('status_text',
  replaceRecipientVariables('%recipient.status_text%', 'member@example.com', ghostVarsMap),
  'Your subscription renews on 1 April 2026'
);
assert('list_unsubscribe',
  replaceRecipientVariables('%recipient.list_unsubscribe%', 'member@example.com', ghostVarsMap),
  'https://blog.example.com/unsubscribe/?uuid=abc-123&newsletter=weekly'
);
assert('uniqueid',
  replaceRecipientVariables('%recipient.uniqueid%', 'member@example.com', ghostVarsMap),
  'f47ac10b-58cc-4372-a567-0e02b2c3d479'
);

// Realistic full HTML template with all 13 variables
console.log('\nRealistic Ghost email template:');

const ghostTemplate = `<html>
<body>
<div class="%recipient.name_class%">Hello %recipient.first_name%,</div>
<p>Welcome %recipient.name% (%recipient.email%)!</p>
<p>Member since: %recipient.created_at%</p>
<p>Status: %recipient.status% - %recipient.status_text%</p>
<p>UUID: %recipient.uuid%</p>
<a href="%recipient.unsubscribe_url%">Unsubscribe</a>
<a href="%recipient.manage_account_url%">Manage Account</a>
<img src="https://example.com/pixel/%recipient.uniqueid%.png" />
</body>
</html>`;

const expectedTemplate = `<html>
<body>
<div class="">Hello Jane,</div>
<p>Welcome Jane Doe (member@example.com)!</p>
<p>Member since: 13 March 2026</p>
<p>Status: paid - Your subscription renews on 1 April 2026</p>
<p>UUID: abc-123-def-456</p>
<a href="https://blog.example.com/unsubscribe/?uuid=abc-123&newsletter=weekly">Unsubscribe</a>
<a href="https://blog.example.com/#/portal/account">Manage Account</a>
<img src="https://example.com/pixel/f47ac10b-58cc-4372-a567-0e02b2c3d479.png" />
</body>
</html>`;

assert('full Ghost template with all 13 variables',
  replaceRecipientVariables(ghostTemplate, 'member@example.com', ghostVarsMap),
  expectedTemplate
);

// name_class = 'hidden' when member has no name
console.log('\nEdge cases:');

const noNameVarsMap = {
  'anon@example.com': {
    first_name: '',
    name: '',
    name_class: 'hidden'
  }
};
assert('name_class hidden when no name',
  replaceRecipientVariables('<div class="%recipient.name_class%">%recipient.first_name%</div>', 'anon@example.com', noNameVarsMap),
  '<div class="hidden"></div>'
);

// Fallback-suffixed variables (Ghost uses e.g. first_name_2 for fallback variants)
const fallbackVarsMap = {
  'member@example.com': {
    first_name: 'Jane',
    first_name_2: 'Subscriber'
  }
};
assert('fallback-suffixed variable (first_name_2)',
  replaceRecipientVariables('Hey %recipient.first_name_2%!', 'member@example.com', fallbackVarsMap),
  'Hey Subscriber!'
);

// ==========================================
// buildRawEmail tests
// ==========================================

// Copy buildRawEmail for testing
function buildRawEmail({ from, to, subject, html, text, replyTo, listUnsubscribe, listUnsubscribePost }) {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines = [];

  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  lines.push(`Sender: ${from}`);
  lines.push(`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`);
  lines.push('MIME-Version: 1.0');
  lines.push('Auto-Submitted: auto-generated');
  lines.push('X-Auto-Response-Suppress: OOF, AutoReply');
  if (replyTo) lines.push(`Reply-To: ${replyTo}`);
  if (listUnsubscribe) lines.push(`List-Unsubscribe: ${listUnsubscribe}`);
  if (listUnsubscribePost) lines.push(`List-Unsubscribe-Post: ${listUnsubscribePost}`);

  if (html && text) {
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push('');
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(text).toString('base64'));
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(html).toString('base64'));
    lines.push(`--${boundary}--`);
  } else if (html) {
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(html).toString('base64'));
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(text || '').toString('base64'));
  }

  return lines.join('\r\n');
}

function assertIncludes(name, haystack, needle) {
  if (haystack.includes(needle)) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    console.log(`    expected to contain: ${JSON.stringify(needle)}`);
    failed++;
  }
}

function assertNotIncludes(name, haystack, needle) {
  if (!haystack.includes(needle)) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name}`);
    console.log(`    expected NOT to contain: ${JSON.stringify(needle)}`);
    failed++;
  }
}

console.log('\nbuildRawEmail:');

const rawBasic = buildRawEmail({
  from: 'sender@example.com',
  to: 'recipient@example.com',
  subject: 'Test Subject',
  html: '<p>Hello</p>',
  text: 'Hello'
});
assertIncludes('includes From header', rawBasic, 'From: sender@example.com');
assertIncludes('includes To header', rawBasic, 'To: recipient@example.com');
assertIncludes('includes Sender header', rawBasic, 'Sender: sender@example.com');
assertIncludes('includes MIME-Version', rawBasic, 'MIME-Version: 1.0');
assertIncludes('includes Auto-Submitted header', rawBasic, 'Auto-Submitted: auto-generated');
assertIncludes('includes X-Auto-Response-Suppress header', rawBasic, 'X-Auto-Response-Suppress: OOF, AutoReply');
assertIncludes('includes multipart/alternative for html+text', rawBasic, 'Content-Type: multipart/alternative');
assertIncludes('includes text/plain part', rawBasic, 'Content-Type: text/plain; charset=UTF-8');
assertIncludes('includes text/html part', rawBasic, 'Content-Type: text/html; charset=UTF-8');

// List-Unsubscribe headers
console.log('\nList-Unsubscribe header support:');

const rawWithUnsub = buildRawEmail({
  from: 'news@blog.com',
  to: 'member@example.com',
  subject: 'Newsletter',
  html: '<p>Content</p>',
  text: null,
  listUnsubscribe: '<https://blog.com/unsubscribe/?uuid=abc-123>',
  listUnsubscribePost: 'List-Unsubscribe=One-Click'
});
assertIncludes('includes List-Unsubscribe header',
  rawWithUnsub, 'List-Unsubscribe: <https://blog.com/unsubscribe/?uuid=abc-123>');
assertIncludes('includes List-Unsubscribe-Post header',
  rawWithUnsub, 'List-Unsubscribe-Post: List-Unsubscribe=One-Click');

const rawWithoutUnsub = buildRawEmail({
  from: 'sender@example.com',
  to: 'recipient@example.com',
  subject: 'No unsub',
  html: '<p>Hi</p>',
  text: null
});
assertNotIncludes('omits List-Unsubscribe when not provided', rawWithoutUnsub, 'List-Unsubscribe');

// Reply-To header
console.log('\nReply-To header:');

const rawWithReply = buildRawEmail({
  from: 'sender@example.com',
  to: 'recipient@example.com',
  subject: 'Test',
  html: '<p>Hi</p>',
  text: null,
  replyTo: 'reply@example.com'
});
assertIncludes('includes Reply-To header', rawWithReply, 'Reply-To: reply@example.com');

// HTML-only email
console.log('\nSingle content type emails:');

const rawHtmlOnly = buildRawEmail({
  from: 'a@b.com', to: 'c@d.com', subject: 'Hi', html: '<b>Bold</b>', text: null
});
assertIncludes('html-only uses text/html content type', rawHtmlOnly, 'Content-Type: text/html; charset=UTF-8');
assertNotIncludes('html-only has no multipart', rawHtmlOnly, 'multipart/alternative');

const rawTextOnly = buildRawEmail({
  from: 'a@b.com', to: 'c@d.com', subject: 'Hi', html: null, text: 'Plain text'
});
assertIncludes('text-only uses text/plain content type', rawTextOnly, 'Content-Type: text/plain; charset=UTF-8');
assertNotIncludes('text-only has no multipart', rawTextOnly, 'multipart/alternative');

// Subject encoding
console.log('\nSubject encoding:');

const rawUnicode = buildRawEmail({
  from: 'a@b.com', to: 'c@d.com', subject: 'Héllo Wörld 🌍', html: '<p>Hi</p>', text: null
});
assertIncludes('encodes subject as base64 UTF-8', rawUnicode, `=?UTF-8?B?${Buffer.from('Héllo Wörld 🌍').toString('base64')}?=`);

// List-Unsubscribe with per-recipient variable substitution
console.log('\nList-Unsubscribe per-recipient substitution:');

const unsubVarsMap = {
  'alice@example.com': { list_unsubscribe: 'https://blog.com/unsub/alice' },
  'bob@example.com': { list_unsubscribe: 'https://blog.com/unsub/bob' }
};

const aliceUnsub = replaceRecipientVariables(
  '<%recipient.list_unsubscribe%>', 'alice@example.com', unsubVarsMap
);
const bobUnsub = replaceRecipientVariables(
  '<%recipient.list_unsubscribe%>', 'bob@example.com', unsubVarsMap
);
assert('List-Unsubscribe substituted for alice', aliceUnsub, '<https://blog.com/unsub/alice>');
assert('List-Unsubscribe substituted for bob', bobUnsub, '<https://blog.com/unsub/bob>');

// Verify different recipients get different headers in raw emails
const aliceRaw = buildRawEmail({
  from: 'news@blog.com', to: 'alice@example.com', subject: 'News',
  html: '<p>Hi</p>', text: null, listUnsubscribe: aliceUnsub
});
const bobRaw = buildRawEmail({
  from: 'news@blog.com', to: 'bob@example.com', subject: 'News',
  html: '<p>Hi</p>', text: null, listUnsubscribe: bobUnsub
});
assertIncludes('alice raw email has her unsubscribe URL', aliceRaw, 'List-Unsubscribe: <https://blog.com/unsub/alice>');
assertIncludes('bob raw email has his unsubscribe URL', bobRaw, 'List-Unsubscribe: <https://blog.com/unsub/bob>');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
