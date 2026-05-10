/**
 * Connector Registry for ContextGate
 * Factory pattern + registration for all built-in connectors
 */

import { ConnectorConfig, BaseConnector } from "./base.js";
import { FileSystemConnector } from "./filesystem.js";
import { PostgresConnector } from "./postgres.js";
import { NotionConnector } from "./notion.js";

export type ConnectorFactory = (config: ConnectorConfig) => BaseConnector;

export class ConnectorRegistry {
  private factories = new Map<string, ConnectorFactory>();
  private instances = new Map<string, BaseConnector>();

  constructor() {
    this.registerBuiltins();
  }

  register(type: string, factory: ConnectorFactory): void {
    this.factories.set(type, factory);
  }

  create(config: ConnectorConfig): BaseConnector {
    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(`Unknown connector type: ${config.type}`);
    }
    const instance = factory(config);
    this.instances.set(config.id, instance);
    return instance;
  }

  get(id: string): BaseConnector | undefined {
    return this.instances.get(id);
  }

  async disconnectAll(): Promise<void> {
    for (const [id, instance] of this.instances) {
      try {
        await instance.disconnect();
      } catch (err) {
        // Log but don't block others
        console.error(`Failed to disconnect connector ${id}:`, err);
      }
    }
    this.instances.clear();
  }

  listTypes(): string[] {
    return Array.from(this.factories.keys());
  }

  listConnectors(): BaseConnector[] {
    return Array.from(this.instances.values());
  }

  // ─── private ──────────────────────────────────────────────────────

  private registerBuiltins(): void {
    this.register("filesystem", (cfg) => new FileSystemConnector(cfg));
    this.register("postgres", (cfg) => new PostgresConnector(cfg));
    this.register("notion", (cfg) => new NotionConnector(cfg));
  }
}
