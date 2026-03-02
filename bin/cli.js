#!/usr/bin/env node
import { readFileSync } from 'fs';
import fs from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import winston from 'winston';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { spawnSync } from 'child_process';
import { select, input } from '@inquirer/prompts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const repoUrl = pkg.repository.url;

const TEMPLATE_STARTER_TEMP_FOLDER = './.template-starter-temp';

const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
  format: winston.format.combine(winston.format.simple(), winston.format.cli()),
});

// Needs Git v2.22

const exec = (cmd, ...args) => {
  logger.verbose(`${cmd} ${args.join(' ')}`);
  const { status, signal, error, stdout: output, stderr: errOutput } = spawnSync(cmd, args, { stdio: 'pipe' });

  if (status !== 0) {
    throw new Error(JSON.stringify({ status, signal, error, log: errOutput.toString(), cmd, args }));
  }

  return output.toString();
};

const removeTemplateGitDir = () => fs.rm(TEMPLATE_STARTER_TEMP_FOLDER, { recursive: true });

const isEmptyBranch = () => {
  try {
    exec('git', '--no-pager', 'log');
    return false;
  } catch {
    return true;
  }
};

const setup = async ({ repo, branch }) => {
  logger.info(`Using branch ${branch} from repository ${repo} as a template`);
  const starterRemoteName = 'template-starter';
  exec('git', 'init');
  try {
    exec('git', 'remote', 'add', '-t', branch, starterRemoteName, repo);
    exec('git', 'fetch', '--all');
    // if there's no commits, we should checkout, otherwise we merge
    if (isEmptyBranch()) {
      const currentBranch = exec('git', 'branch', '--show-current').trim();
      exec('git', 'pull', '--no-commit', '--depth', '1', starterRemoteName, `${branch}:${currentBranch}`);
    } else {
      exec(
        'git',
        'merge',
        `${starterRemoteName}/${branch}`,
        '--allow-unrelated-histories',
        '--autostash',
        `-m "Starting template ${repo} ${branch}"`,
        '--no-stat',
      );
    }
  } finally {
    exec('git', 'remote', 'remove', `${starterRemoteName}`);
  }

  logger.info(
    "Git has been initialized (if it was not already) and the template has been downloaded. Please refer to the template's README.MD for next steps.",
  );
};

const getRepoBranchNames = async (repo) => {
  try {
    await fs.mkdir(TEMPLATE_STARTER_TEMP_FOLDER);
    exec('git', 'clone', '--bare', repo, TEMPLATE_STARTER_TEMP_FOLDER);
    const branches = exec('git', `--git-dir=${TEMPLATE_STARTER_TEMP_FOLDER}`, 'branch', '-l', "--format='%(refname)'")
      .split('\n')
      .map((ref) => ref.replace(/'/g, ''))
      .filter((ref) => ref.length > 0)
      .map((ref) => ref.replace(/^refs\/heads\//, ''))
      .filter((ref) => !(repo === repoUrl && ref === 'main')); // main branch holds starter execution code, no templates.

    return branches;
  } finally {
    // cleanup
    await removeTemplateGitDir();
  }
};

const askSetupArgs = async () => {
  logger.info('Welcome to the guided setup of your new node project.');
  const defaultRepoBranches = await getRepoBranchNames(repoUrl);
  const template = await select({
    message: 'Which template do you want to use?',
    choices: [...defaultRepoBranches, 'custom'].map((c) => ({ name: c, value: c })),
  });

  if (template !== 'custom') {
    return { repo: repoUrl, branch: template };
  }

  const repo = await input({
    message: 'Which repository should be used? (note: HTTP authentication is not yet supported)',
  });

  const customRepoBranches = await getRepoBranchNames(repo, true);
  const customTemplate = await select({
    message: 'Which template do you want to use of your custom repository?',
    choices: customRepoBranches.map((c) => ({ name: c, value: c })),
  });

  return { repo, branch: customTemplate };
};

const script = async (args) => {
  const { guided, verbose } = args;
  if (verbose) {
    logger.level = 'verbose';
  }
  if (guided) {
    const setupArgs = await askSetupArgs();
    await setup(setupArgs);

    return;
  }
  logger.info('Coming soon...');
};

const options = await yargs(hideBin(process.argv))
  .option('guided', {
    description: 'Whether to use a guided deploy. Bypasses all other supplied arguments.',
    boolean: true,
    default: true,
    alias: 'g',
  })
  .option('verbose', {
    description: 'Enable verbose logging.',
    boolean: true,
    default: false,
    alias: 'v',
  })
  .alias('h', 'help')
  .parse();

script(options).catch(logger.error);
