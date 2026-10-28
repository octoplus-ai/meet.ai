import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMeetingUrl, extractMeetingUrl, enabledPlatforms, requireEnabledMeeting, meetingLimitMinutes } from '../shared/meeting-platform.js';

test('canonical providers preserve private link tokens without treating them as passcodes', () => {
  const zoom = parseMeetingUrl('https://us02web.zoom.us/j/12345678901?pwd=opaque%2Btoken#discard');
  assert.equal(zoom.platform, 'zoom'); assert.equal(zoom.browserJoinUrl, 'https://us02web.zoom.us/wc/12345678901/join?pwd=opaque%2Btoken');
  assert.equal(zoom.passcode, undefined);
  for (const host of ['teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft']) {
    assert.equal(parseMeetingUrl(`https://${host}/meet/123456789012?p=private`).platform, 'teams');
    assert.equal(parseMeetingUrl(`https://${host}/l/meetup-join/19%3ameeting_YWJj%40thread.v2/0?context=%7B%7D`).platform, 'teams');
  }
  for (const url of ['https://meet.google.com/abc-defg-hij', 'https://meet.google.com/lookup/school-1']) assert.equal(parseMeetingUrl(url).platform, 'google_meet');
  assert.equal(parseMeetingUrl('https://zoom.us/my/private-room').meetingId, undefined);
});

test('host spoofing, unsafe protocols, userinfo, nonmeeting pages and malformed paths fail closed', () => {
  for (const url of ['https://zoom.us.evil.test/j/12345678901', 'https://example.com/?next=https://meet.google.com/abc-defg-hij',
    'https://meet.google.com@evil.test/abc-defg-hij', 'https://user:pass@zoom.us/j/12345678901', 'http://zoom.us/j/12345678901',
    'https://zoom.us:8443/j/12345678901', 'https://zoom.us/j/123', 'https://zoom.us/profile', 'https://teams.cloud.microsoft.com/meet/123456789012',
    'https://teams.microsoft.com/l/meetup-join/19%253ameeting_YWJj%2540thread.v2/0', 'https://meet.google.com/a',
    'https://zoom.us\\@evil.test/j/12345678901', 'javascript:alert(1)', 'file:///tmp/test', '\nhttps://meet.google.com/abc-defg-hij', null]) {
    assert.throws(() => parseMeetingUrl(url), error => ['invalid_meeting_url', 'unsupported_platform'].includes(error.code) && !error.message.includes('https:'));
  }
});

test('calendar extracts direct, HTML and plain-text links consistently', () => {
  const url = 'https://zoom.us/j/12345678901?pwd=abc&from=calendar';
  assert.equal(extractMeetingUrl({description: `<a href="${url.replace('&', '&amp;')}">Join</a>`}), url);
  assert.equal(extractMeetingUrl({location: `Join: (${url}).`}), url);
  assert.equal(extractMeetingUrl({conferenceData: {entryPoints: [{entryPointType:'phone',uri:'tel:123'}]},onlineMeeting:{joinUrl:'https://teams.live.com/meet/123456789012?p=x'}}), 'https://teams.live.com/meet/123456789012?p=x');
  assert.equal(extractMeetingUrl({description:'https://zoom.us.evil.test/j/12345678901'}), null);
  assert.equal(extractMeetingUrl({hangoutLink:'https://meet.google.com/abc-defg-hij',description:url}), 'https://meet.google.com/abc-defg-hij');
});

test('default rollout keeps only Meet, unknown values never enable new providers, caps at two hours', () => {
  assert.deepEqual([...enabledPlatforms({})], ['google_meet']);
  assert.deepEqual([...enabledPlatforms({BOT_ENABLED_PLATFORMS:'none'})], []);
  assert.deepEqual([...enabledPlatforms({BOT_ENABLED_PLATFORMS:'all,zoomish'})], []);
  assert.deepEqual([...enabledPlatforms({BOT_ENABLED_PLATFORMS:'google_meet,zoom,teams,zoom'})], ['google_meet','zoom','teams']);
  assert.throws(() => requireEnabledMeeting('https://zoom.us/j/12345678901'), {code:'platform_disabled',status:409});
  assert.equal(meetingLimitMinutes(60),60); assert.equal(meetingLimitMinutes(240),120);
  assert.equal(meetingLimitMinutes('invalid'),120); assert.equal(meetingLimitMinutes(-1),120);
});

