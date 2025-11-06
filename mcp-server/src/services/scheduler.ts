type Task = {
  id: string
  intervalMs: number
  handler: () => Promise<void>
}

export class Scheduler {
  private timers = new Map<string, NodeJS.Timeout>()

  register(task: Task) {
    if (this.timers.has(task.id)) {
      throw new Error(`Task already registered: ${task.id}`)
    }

    const run = async () => {
      try {
        await task.handler()
      } finally {
        const timeout = setTimeout(run, task.intervalMs)
        this.timers.set(task.id, timeout)
      }
    }

    const timeout = setTimeout(run, 1)
    this.timers.set(task.id, timeout)
  }

  stopAll() {
    for (const timeout of this.timers.values()) {
      clearTimeout(timeout)
    }
    this.timers.clear()
  }
}
