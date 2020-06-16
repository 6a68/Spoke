import { r, cacheableData } from "../../../src/server/models";
import {
  postMessageSave,
  available,
  DEFAULT_PROFANITY_REGEX_BASE64
} from "../../../src/integrations/message-handlers/profanity-tagger";

import {
  setupTest,
  cleanupTest,
  createStartedCampaign,
  sendMessage
} from "../../test_helpers";

beforeEach(async () => {
  // Set up an entire working campaign
  await setupTest();
  global.MESSAGE_HANDLERS = "profanity-tagger";
}, global.DATABASE_SETUP_TEARDOWN_TIMEOUT);

afterEach(async () => {
  await cleanupTest();
  if (r.redis) r.redis.flushdb();
  global.MESSAGE_HANDLERS = undefined;
}, global.DATABASE_SETUP_TEARDOWN_TIMEOUT);

describe("Message Hanlder: profanity-tagger", () => {
  it("default regex works", () => {
    const re = new RegExp(
      Buffer.from(DEFAULT_PROFANITY_REGEX_BASE64, "base64").toString(),
      "i"
    );
    expect(re.test("blah blah fakeslur blah blah")).toBe(true);
    expect("brass shoe eddie homonym".match(re)).toBe(null);
  });

  it("Contact profanity is flagged", async () => {
    // SETUP
    const c = await createStartedCampaign();
    await r.knex("tag").insert([
      {
        name: "Contact Profanity",
        description: "mean contact",
        organization_id: c.organizationId
      },
      {
        name: "Texter language flag",
        description: "texter inappropriate",
        organization_id: c.organizationId
      }
    ]);
    await r
      .knex("organization")
      .update(
        "features",
        '{"EXPERIMENTAL_TAGS": "1", "PROFANITY_CONTACT_TAG_ID": "1", "PROFANITY_TEXTER_TAG_ID": "2"}'
      );
    await cacheableData.organization.clear(c.organizationId);
    const org = await cacheableData.organization.load(c.organizationId);
    await sendMessage(c.testContacts[1].id, c.testTexterUser, {
      userId: c.testTexterUser.id,
      contactNumber: c.testContacts[1].cell,
      text: "brass shoe eddie homonym",
      assignmentId: c.assignmentId
    });
    await cacheableData.message.save({
      contact: c.testContacts[1],
      messageInstance: {
        is_from_contact: true,
        text: "go to fakeslur!",
        contact_number: c.testContacts[1].cell,
        service: "fakeservice",
        messageservice_sid: "fakeservice",
        send_status: "DELIVERED"
      }
    });

    const text1 = await r
      .knex("tag_campaign_contact")
      .select("tag_id", "campaign_contact_id");
    expect(text1).toEqual([{ tag_id: 1, campaign_contact_id: 2 }]);
  });

  it("Texter profanity is flagged", async () => {
    // SETUP
    const c = await createStartedCampaign();
    await r.knex("tag").insert([
      {
        name: "Contact Profanity",
        description: "mean contact",
        organization_id: c.organizationId
      },
      {
        name: "Texter language flag",
        description: "texter inappropriate",
        organization_id: c.organizationId
      }
    ]);
    await r
      .knex("organization")
      .update(
        "features",
        '{"EXPERIMENTAL_TAGS": "1", "PROFANITY_CONTACT_TAG_ID": "1", "PROFANITY_TEXTER_TAG_ID": "2"}'
      );
    await cacheableData.organization.clear(c.organizationId);
    const org = await cacheableData.organization.load(c.organizationId);

    // Confirm Available
    expect(available(org)).toBeTruthy();

    // Confirm texter catch
    await sendMessage(c.testContacts[0].id, c.testTexterUser, {
      userId: c.testTexterUser.id,
      contactNumber: c.testContacts[0].cell,
      text: "Some fakeslur message",
      assignmentId: c.assignmentId
    });
    const text1 = await r
      .knex("tag_campaign_contact")
      .select("tag_id", "campaign_contact_id")
      .where("campaign_contact_id", 1);
    expect(text1).toEqual([{ tag_id: 2, campaign_contact_id: 1 }]);

    // Confirm texter no-match
    await sendMessage(c.testContacts[1].id, c.testTexterUser, {
      userId: c.testTexterUser.id,
      contactNumber: c.testContacts[1].cell,
      text: "brass shoe eddie homonym",
      assignmentId: c.assignmentId
    });
    const text2 = await r
      .knex("tag_campaign_contact")
      .select("tag_id", "campaign_contact_id")
      .where("campaign_contact_id", 2);
    expect(text2).toEqual([]);
  });
});
