// @flow

import {NodeAddress} from "./graph";
import * as WG from "./weightedGraph";
import {anyCommonPrefixes, applyBudget} from "./mintBudget";

describe("core/mintBudget", () => {
  describe("applyBudget", () => {
    it("errors if there are prefix conflicts", () => {
      const line1 = {prefix: NodeAddress.empty, policies: []};
      const line2 = {prefix: NodeAddress.fromParts(["foo"]), policies: []};
      const badBudget = {intervalLength: "WEEKLY", lines: [line1, line2]};
      expect(applyBudget(WG.empty(), badBudget)).toThrow(
        "budget prefix conflict detected"
      );
    });
    it("errors if the intervalLength is not weekly", () => {
      const badBudget = {intervalLength: "DAILY", lines: []};
      // $FlowExpectedError[incompatible-call]
      expect(applyBudget(WG.empty(), badBudget)).toThrow(
        "non-weekly budgets not supported"
      );
    });
    it("errors if the policies are out-of-order", () => {
      const p1 = {budget: 100, startTimeMs: 50};
      const p2 = {budget: 50, startTimeMs: 25};
      const line = {prefix: NodeAddress.empty, policies: [p1, p2]};
      const budget = {intervalLength: "WEEKLY", lines: [line]};
      expect(applyBudget(WG.empty(), budget)).toThrow("policies out-of-order");
    });
  });
  describe("anyCommonPrefixes", () => {
    it("returns true if there are common prefixes", () => {
      // Empty address is prefix of everything
      expect(
        anyCommonPrefixes([NodeAddress.empty, NodeAddress.fromParts(["foo"])])
      ).toBe(true);
    });
    it("returns false for no common prefixes", () => {
      expect(
        anyCommonPrefixes([
          NodeAddress.fromParts(["bar"]),
          NodeAddress.fromParts(["foo"]),
        ])
      ).toBe(false);
    });
    it("returns false in the empty case", () => {
      expect(anyCommonPrefixes([])).toBe(false);
    });
  });
});
