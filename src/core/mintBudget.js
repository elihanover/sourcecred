// @flow

import * as NullUtil from "../util/null";
import * as Weights from "./weights";
import {type NodeAddressT, NodeAddress} from "./graph";
import {type WeightedGraph as WeightedGraphT} from "./weightedGraph";
import {nodeWeightEvaluator} from "./algorithm/weightEvaluator";
import {partitionGraph} from "./interval";
import type {TimestampMs} from "../util/timestamp";

/**
 * This module adds logic for imposing a Cred minting budget on a graph.
 *
 * Basically, we allow specifiying a budget where nodes matching a particular address may mint
 * at most a fixed amount of Cred per period. Since every plugin writes nodes with a distinct prefix,
 * this may be used to specify plugin-level Cred budgets. The same mechanism could also be used to
 * implement more finely-grained budgets, e.g. for specific node types.
 */

// Hardcode the period to weeks for now, but include it in the data layer so that we can more
// easily change it later.
export type IntervalLength = "WEEKLY";
export type BudgetPolicy = {|
  // When this budget policy starts
  +startTimeMs: TimestampMs,
  // How much Cred can be minted per interval
  +budget: number,
|};

// A particular "line item" in the Cred budget.
export type BudgetLine = {|
  // The budget will apply to nodes with the following prefix.
  +prefix: NodeAddressT,
  // The policies (should be sorted in time order).
  policies: $ReadOnlyArray<BudgetPolicy>,
|};

// An array of budget line items. No BudgetLine's prefix should be the prefix
// of any other BudgetLine's prefix (otherwise we wouldn't know which budget to
// apply.)
export type Budget = {|
  +lines: $ReadOnlyArray<BudgetLine>,
  +intervalLength: IntervalLength,
|};

/**
 * Given a WeightedGraph and a budget, return a new WeightedGraph which ensures
 * that the budget constraint is satisfied.
 *
 * Concretely, this means that the weights in the Graph may be reduced, as
 * necessary, in order to bring the total minted Cred within an interval down
 * to the budget's requirements.
 */
export function applyBudget(
  wg: WeightedGraphT,
  budget: Budget
): WeightedGraphT {
  if (anyCommonPrefixes(budget.lines.map((x) => x.prefix))) {
    throw new Error(`budget prefix conflict detected`);
  }
  if (budget.intervalLength !== "WEEKLY") {
    throw new Error(`non-weekly budgets not supported`);
  }
  const evaluator = nodeWeightEvaluator(wg.weights);
  const weeklyGraphPartition = partitionGraph(wg.graph);
  const updatedWeights = Weights.copy(wg.weights);

  for (const {prefix, policies} of budget.lines) {
    if (!inSortedOrder(policies.map((x) => x.startTimeMs))) {
      throw new Error(
        `budget for ${NodeAddress.toString(prefix)} has policies out-of-order`
      );
    }
    let policyIndex = -1;
    let currentBudget = Infinity;
    for (const {interval, nodes} of weeklyGraphPartition) {
      while (
        policies.length > policyIndex &&
        policies[policyIndex].startTimeMs <= interval.startTimeMs
      ) {
        policyIndex++;
        currentBudget = policies[policyIndex].budget;
      }
      let mintedCredInInterval = 0;
      for (const {address} of nodes) {
        mintedCredInInterval += evaluator(address);
      }
      if (mintedCredInInterval > currentBudget) {
        const normalizer = currentBudget / mintedCredInInterval;
        for (const {address} of nodes) {
          const oldWeight = NullUtil.orElse(
            wg.weights.nodeWeights.get(address),
            1
          );
          const newWeight = oldWeight * normalizer;
          updatedWeights.nodeWeights.set(address, newWeight);
        }
      }
    }
  }
  return {graph: wg.graph, weights: updatedWeights};
}

/**
 * Given an array of node addresses, return true if any node address is a prefix
 * of another address.
 *
 * This method runs in O(n^2). This should be fine because it's intended to be
 * run on small arrays (~one per plugin). If this becomes a performance
 * hotpsot, we can write a more performant version.
 */
export function anyCommonPrefixes(
  addresses: $ReadOnlyArray<NodeAddressT>
): boolean {
  for (const a of addresses) {
    for (const b of addresses) {
      if (NodeAddress.hasPrefix(a, b)) {
        return true;
      }
    }
  }
  return false;
}

function inSortedOrder(xs: $ReadOnlyArray<number>): boolean {
  let last = -Infinity;
  for (const x of xs) {
    if (x < last) {
      return false;
    }
  }
  return true;
}
