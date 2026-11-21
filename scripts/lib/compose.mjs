import path from 'node:path';

export const INFRA_ROLES = ['db', 'auth', 's3', 'proxy'];
export const SERVICE_ROLES = [...INFRA_ROLES, 's3console', 'web', 'queue', 'pyworker', 'maintenance'];
const legacyRoles = { postgres: 'db', keycloak: 'auth', seaweedfs: 's3', nginx: 'proxy' };

export function serviceRole(name) {
  return Object.hasOwn(legacyRoles, name) ? legacyRoles[name] : name;
}

export function containerName(env, role) {
  if (!['dev', 'qa', 'prod'].includes(env.ENV_MODE) || !SERVICE_ROLES.includes(role) || !/^\d+$/.test(env.INSTANCE_INDEX || '0')) {
    throw new Error('Invalid container environment, role or instance index.');
  }
  return `${env.ENV_MODE}-${role}-${env.INSTANCE_INDEX || '0'}`;
}

/** Always address the owning Compose project and service, never a constructed container name. */
export function composeArgs(root, mode, env, profiles = []) {
  if (!['dev', 'qa'].includes(mode) || env.ENV_MODE !== mode || !/^[a-z0-9][a-z0-9_-]{0,62}$/.test(env.STACK_NAME || '') ||
      profiles.some(profile => !['tools', 'maintenance'].includes(profile))) throw new Error('Invalid Compose project identity.');
  return ['compose', '--project-name', env.STACK_NAME, '--env-file', path.resolve(root, `infra/local/.env.${mode}`),
    '-f', path.join(root, 'infra/local/compose.yaml'), '-f', path.join(root, `infra/local/compose.${mode}.yaml`),
    ...profiles.flatMap(profile => ['--profile', profile])];
}
