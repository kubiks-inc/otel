#!/usr/bin/env node
import { cpus } from "node:os";
import { stderr, stdout } from "node:process";
import { URL } from "node:url";
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
  SHARE_ENV,
} from "node:worker_threads";
import chalk from "chalk";
import { ESLint } from "eslint";
import { globby } from "globby";
// import { hookStderr } from 'hook-std';
import logUpdate from "log-update";

/** @param {string} msg */
const log = (msg = "") => stdout.write(`${msg}\n`);

/**
 * Logs the current progress.
 *
 * @param {ESLint.LintResult[]} eslintResults
 * @param {string[]} files
 */
const logStatus = (eslintResults, files) => {
  const isFinished = eslintResults.length === files.length;

  const count = `${eslintResults.length} of ${files.length} file${
    files.length === 1 ? "" : "s"
  } processed.${isFinished ? "" : ".."}`;

  let update = count;
  if (!isFinished) {
    const percentage = eslintResults.length / files.length;
    const progress = Math.round(50 * percentage);
    const progressBar = `${"█".repeat(progress)}${"░".repeat(
      Math.round(50 - progress),
    )} ${(percentage * 100).toFixed(2)}%`;
    update = `${progressBar}\n\n(${count})`;
  }

  logUpdate(update);
};

if (isMainThread) {
  const args = process.argv.slice(2);
  /** @type {ESLint.LintResult[]} */
  const eslintResults = [];
  const eslint = new ESLint({ useEslintrc: true });
  const formatter = await eslint.loadFormatter("stylish");
  const isCi = process.env.CI;
  const isFix = args.includes("--fix");
  const workers = new Set();
  const extensions = ["cjs", "js", "jsx", "mjs", "ts", "tsx"];
  const defaultGlob = `**/*.{${extensions.join(",")}}`;
  // @ts-ignore - resolved in TypeScript 4.7+
  const listFormatter = new Intl.ListFormat("en", { type: "conjunction" });

  // Filter out any options, i.e. `--fix`.
  const dirsAndGlobs = args.filter((arg) => !arg.startsWith("-"));

  // Check for any unsupported file extensions.
  const badFiles = dirsAndGlobs.filter((dirOrGlob) => {
    const match = dirOrGlob.match(/.\.(?<extension>\w+$)/i);
    const extension = match?.groups?.["extension"];
    return extension ? !extensions.includes(extension) : false;
  });

  if (badFiles.length) {
    stderr.write(
      chalk.bold.red(
        `✖ The following files can't be processed by ESLint: ${listFormatter.format(
          badFiles,
        )}.`,
      ),
    );
    log();
    process.exit(1);
  }

  // Ensure all dirs are valid globs.
  const globs = dirsAndGlobs.length
    ? dirsAndGlobs.map((dirOrGlob) =>
        extensions.some((ext) => dirOrGlob.endsWith(`.${ext}`))
          ? dirOrGlob
          : `${dirOrGlob}/${defaultGlob}`,
      )
    : [defaultGlob];

  log(
    `Running ESLint ${isFix ? "(with `--fix`) " : ""}on ${
      dirsAndGlobs.length
        ? listFormatter.format(
            dirsAndGlobs.map((dirOrGlob) => chalk.yellow(dirOrGlob)),
          )
        : chalk.yellow("all files")
    }.`,
  );
  log();

  // To read merged `ignorePatterns`, we use the root eslint config file.
  const { ignorePatterns } = await eslint.calculateConfigForFile("*");

  const files = await globby(globs, {
    dot: true,
    ignore: ignorePatterns,
  });

  // More cores can have a negative impact on performance.
  let workerCount = Math.floor(cpus().length / 2);
  if (workerCount > files.length) {
    workerCount = files.length;
  }

  const chunkSize = files.length / workerCount;
  const workerFilename = new URL(import.meta.url);
  for (let i = 0; i < workerCount; i++) {
    const startIndex = chunkSize * i;
    const filesChunk = files.slice(startIndex, startIndex + chunkSize);
    workers.add(
      new Worker(workerFilename, {
        workerData: { files: filesChunk, fix: isFix },
        env: SHARE_ENV,
      }),
    );
  }

  log(chalk.yellow(`Using ${workerCount} workers.`));
  if (!isCi) {
    log();
    logStatus(eslintResults, files);
  }

  for (const worker of workers) {
    worker.on(
      "error",
      /** @param {Error} error */ (error) => {
        throw error;
      },
    );

    worker.on("exit", async () => {
      workers.delete(worker);
      if (workers.size === 0) {
        await ESLint.outputFixes(eslintResults);
        const results = await formatter.format(eslintResults);
        logUpdate.done();

        if (results) {
          stderr.write(results);
          process.exit(1);
        } else {
          log();
          log(chalk.bold.green("✔ 0 problems found"));
          log();
          log(chalk.blackBright("Made with ♥ by Team Pyra"));
        }
      }
    });

    worker.on(
      "message",
      /**
       * @param {ESLint.LintResult} result
       */
      async (result) => {
        eslintResults.push(result);

        // stderr.write(`${chalk.white(file)}`);

        if (!isCi) {
          logStatus(eslintResults, files);
        }
      },
    );
  }
} else {
  /** @type {string[]} */
  const files = workerData.files;
  /** @type {boolean} */
  const fix = workerData.fix;

  const eslint = new ESLint({ fix, useEslintrc: true });

  for await (const file of files) {
    // FIXME: Because this stderr is inherited from the parent (shared), this
    // could attribute the wrong file to a warning/error.
    // Instead of writing to stderr, we can add to an array, and send back with
    // the result for each file.
    // const promise = hookStderr((output) => {
    //   // stderr.write(`${chalk.white(file)}: ${chalk.blackBright(output)}`);
    //   stderr.write(`${file}: ${output}`);
    // });

    const [result] = await eslint.lintFiles(file);

    // Unhook before we post message, as we may write to stderr.
    // await promise.unhook();

    parentPort?.postMessage(result);
  }
}
