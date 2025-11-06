import { Aggregator } from './core/agg/aggregator.js'
import { RulesEngine } from './core/rules/engine.js'

export interface Runtime {
  aggregator: Aggregator
  rulesEngine: RulesEngine
}

const runtime: Runtime = {
  aggregator: new Aggregator(),
  rulesEngine: new RulesEngine(),
}

export function getRuntime(): Runtime {
  return runtime
}
