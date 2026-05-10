/**
 * Policy Engine — enforces glob-pattern access control rules per agent.
 *
 * Policies can be scoped per-agent OR per-workspace. The engine combines
 * both sets at evaluation time:
 *
 *   - per-agent (`agentId` set, `workspaceId` null) — applies only to that agent
 *   - per-workspace (`workspaceId` set, `agentId` null) — applies to every
 *     agent in the workspace
 *
 * Default behavior is DENY when no matching allow-policy is found.
 */

import { db } from "@contextgate/core";
import { policies, agents } from "@contextgate/core";
import { eq, or, and, isNull } from "drizzle-orm";

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  matchedPolicyId?: string;
}

/**
 * Convert a glob pattern to a RegExp.
 * Supports:
 *   *  → matches any character except `/`
 *   ** → matches any character including `/`
 *   ?  → matches a single character
 */
export function globToRegex(pattern: string): RegExp {
  // Escape regex special characters except glob ones we'll convert below
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  // Order matters: ** must be replaced before *
  const regex = escaped
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp("^" + regex + "$");
}

export function matchesPattern(uri: string, pattern: string): boolean {
  return globToRegex(pattern).test(uri);
}

export class PolicyEngine {
  /**
   * Decide whether `agentId` may perform `action` on `uri`.
   *
   * Considers both agent-scoped and workspace-scoped policies.
   */
  async check(
    agentId: string,
    uri: string,
    action: string
  ): Promise<PolicyDecision> {
    // Look up the agent's workspace so we can also pull workspace policies
    const agentRows = await db
      .select({ workspaceId: agents.workspaceId })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);

    if (agentRows.length === 0) {
      return { allowed: false, reason: "Agent not found" };
    }
    const workspaceId = agentRows[0].workspaceId;

    // Pull both per-agent and per-workspace policies in one query
    const candidatePolicies = await db
      .select()
      .from(policies)
      .where(
        or(
          // per-agent policy
          and(eq(policies.agentId, agentId), isNull(policies.workspaceId)),
          // per-workspace policy that applies to this agent's workspace
          and(eq(policies.workspaceId, workspaceId), isNull(policies.agentId))
        )
      );

    if (candidatePolicies.length === 0) {
      return {
        allowed: false,
        reason: "No policies defined for agent or its workspace",
      };
    }

    for (const policy of candidatePolicies) {
      const actionAllowed =
        policy.actions.includes(action) || policy.actions.includes("*");
      if (!actionAllowed) continue;

      if (matchesPattern(uri, policy.resourcePattern)) {
        return {
          allowed: true,
          reason: `Matched policy ${policy.id}`,
          matchedPolicyId: policy.id,
        };
      }
    }

    return {
      allowed: false,
      reason: `No policy allows action "${action}" on "${uri}"`,
    };
  }
}

export const policyEngine = new PolicyEngine();
