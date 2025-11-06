import EventEmitter from 'eventemitter3'
import type { AgentRule } from '@prisma/client'
import { prisma } from '../../db.js'
import { logger } from '../../logger.js'
import type { TokenStatSnapshot } from '../agg/aggregator.js'

type ComparatorExpr =
  | { ['>=']: [string, number] }
  | { ['<=']: [string, number] }
  | { ['>']: [string, number] }
  | { ['<']: [string, number] }
  | { ['==']: [string, number] }
  | { ['!=']: [string, number] }

type LogicalExpr =
  | { all: Expression[] }
  | { any: Expression[] }
  | { none: Expression[] }

type Expression = ComparatorExpr | LogicalExpr

interface RuleRuntime {
  rule: AgentRule
  expression: Expression
  cooldownSec: number
  lastTriggered?: number
}

export interface RuleTriggerPayload {
  ruleId: string
  mint: string
  snapshot: TokenStatSnapshot
}

export declare interface RulesEngine {
  on(event: 'trigger', listener: (payload: RuleTriggerPayload) => void): this
}

export class RulesEngine extends EventEmitter {
  private rules: RuleRuntime[] = []
  private reloadTimer: NodeJS.Timeout | null = null

  async start() {
    await this.loadRules()
    this.reloadTimer = setInterval(() => {
      void this.loadRules()
    }, 60_000)
  }

  stop() {
    if (this.reloadTimer) clearInterval(this.reloadTimer)
    this.reloadTimer = null
  }

  async loadRules() {
    try {
      const rows = await prisma.agentRule.findMany({
        where: { enabled: true },
      })
      this.rules = rows
        .map((row) => {
          try {
            const expression = row.expression as Expression
            return {
              rule: row,
              expression,
              cooldownSec: row.cooldownSec ?? 60,
            }
          } catch (error) {
            logger.error({ row, error }, 'Failed to parse rule expression')
            return null
          }
        })
        .filter((value): value is RuleRuntime => Boolean(value))

      logger.info({ count: this.rules.length }, 'Rules loaded')
    } catch (error) {
      logger.error({ error }, 'Failed to load rules')
    }
  }

  async handleSnapshot(snapshot: TokenStatSnapshot) {
    const now = Date.now()
    for (const runtime of this.rules) {
      const { rule, expression, cooldownSec } = runtime
      if (rule.mint && rule.mint !== '*' && rule.mint !== snapshot.mint) {
        continue
      }

      const shouldTrigger = this.evaluateExpression(expression, snapshot)
      if (!shouldTrigger) continue

      if (runtime.lastTriggered && now - runtime.lastTriggered < cooldownSec * 1000) {
        continue
      }

      runtime.lastTriggered = now
      this.emit('trigger', {
        ruleId: rule.id,
        mint: snapshot.mint,
        snapshot,
      })

      await prisma.agentSignal.create({
        data: {
          id: `${rule.id}-${snapshot.mint}-${now}`,
          kind: 'RULE_TRIGGER',
          mint: snapshot.mint,
          payload: {
            ruleId: rule.id,
            snapshot,
          },
        },
      })
    }
  }

  private evaluateExpression(expression: Expression, snapshot: TokenStatSnapshot): boolean {
    if ('all' in expression) {
      return expression.all.every((expr) => this.evaluateExpression(expr, snapshot))
    }
    if ('any' in expression) {
      return expression.any.some((expr) => this.evaluateExpression(expr, snapshot))
    }
    if ('none' in expression) {
      return !expression.none.some((expr) => this.evaluateExpression(expr, snapshot))
    }

    const [metric, threshold] = Object.values(expression)[0] as [string, number]
    const operator = Object.keys(expression)[0]
    const value = (snapshot as unknown as Record<string, number | undefined>)[metric]

    if (value === undefined || value === null || Number.isNaN(value)) {
      return false
    }

    switch (operator) {
      case '>=':
        return value >= threshold
      case '<=':
        return value <= threshold
      case '>':
        return value > threshold
      case '<':
        return value < threshold
      case '==':
        return value === threshold
      case '!=':
        return value !== threshold
      default:
        return false
    }
  }
}
