import { fixture01 } from './01-hello-world.js'
import { fixture02 } from './02-json-parser.js'
import { fixture03 } from './03-readme-writer.js'
import { fixture04 } from './04-csv-analyzer.js'
import { fixture05 } from './05-todo-app.js'
import { fixture06 } from './06-summary-writer.js'
import { fixture07 } from './07-config-generator.js'
import { fixture08 } from './08-test-writer.js'
import { fixture09 } from './09-data-transformer.js'
import { fixture10 } from './10-mixed-task.js'
import type { BenchmarkFixture } from '../types.js'

export const REFERENCE_PLANS: BenchmarkFixture[] = [
  fixture01,
  fixture02,
  fixture03,
  fixture04,
  fixture05,
  fixture06,
  fixture07,
  fixture08,
  fixture09,
  fixture10,
]
