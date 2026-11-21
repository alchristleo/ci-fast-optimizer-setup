import { expect, test } from "bun:test";
import { mergeJunit } from "./timings.ts";

// Trimmed from real `bun test --reporter=junit` output.
const bunXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="4" assertions="6" failures="0" skipped="0" time="2.110247923">
  <testsuite name="test/domains/customers.test.ts" file="test/domains/customers.test.ts" tests="2" assertions="3" failures="0" skipped="0" time="0.980059221" hostname="Aleo168">
    <testsuite name="customers" file="test/domains/customers.test.ts" line="7" tests="2" assertions="3" failures="0" skipped="0" time="0.004" hostname="Aleo168">
      <testcase name="creates a customer with a lowercase email" classname="customers" time="0.004676" file="test/domains/customers.test.ts" line="8" assertions="2" />
      <testcase name="rejects a bad email" classname="customers" time="0.000146" file="test/domains/customers.test.ts" line="13" assertions="1" />
    </testsuite>
  </testsuite>
  <testsuite name="test/domains/inventory.test.ts" file="test/domains/inventory.test.ts" tests="2" assertions="3" failures="0" skipped="0" time="0.001420465" hostname="Aleo168">
    <testsuite name="inventory" file="test/domains/inventory.test.ts" line="7" tests="2" assertions="3" failures="0" skipped="0" time="0" hostname="Aleo168">
      <testcase name="creates and reads an item" classname="inventory" time="0.25" file="test/domains/inventory.test.ts" line="8" assertions="2" />
      <testcase name="rejects a bad sku" classname="inventory" time="0.0004" file="test/domains/inventory.test.ts" line="12" assertions="1" />
    </testsuite>
  </testsuite>
</testsuites>
`;

// Trimmed from real `vitest run --reporter=junit` output.
const vitestXml = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="3" failures="0" errors="0" time="0.040502421">
    <testsuite name="test/domains/orders.test.ts" timestamp="2026-11-21T14:22:43.462Z" hostname="Aleo168" tests="3" failures="0" errors="0" skipped="0" time="0.019773882">
        <testcase classname="test/domains/orders.test.ts" name="orders &gt; creates &amp; prices an order" time="0.015281648">
        </testcase>
        <testcase classname="test/domains/orders.test.ts" name="orders &gt; rejects a bad quantity" time="0.000587128">
        </testcase>
        <testcase classname="test/domains/orders.test.ts" name="orders &gt; cancels" time="0.5">
        </testcase>
    </testsuite>
</testsuites>
`;

test("sums testcase times per file in ms from bun and vitest junit", () => {
  expect(mergeJunit([bunXml, vitestXml])).toEqual({
    "test/domains/customers.test.ts": 5,
    "test/domains/inventory.test.ts": 250,
    "test/domains/orders.test.ts": 516,
  });
});

test("sums a file that appears in several junit inputs", () => {
  expect(mergeJunit([bunXml, bunXml])["test/domains/inventory.test.ts"]).toBe(501);
});
