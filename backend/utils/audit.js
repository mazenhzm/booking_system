import { randomUUID } from 'crypto';
import { sqlRun } from '../db/database.js';

export const writeAuditLog = async ({ user, action, entity, entityId, metadata = {}, ipAddress = '127.0.0.1' }) => {
  if (!user?.id) {
    return null;
  }

  const payload = {
    id: randomUUID(),
    user_id: user.id,
    action,
    entity,
    entity_id: entityId || null,
    old_value: null,
    new_value: metadata && Object.keys(metadata).length ? JSON.stringify(metadata) : null,
    ip_address: ipAddress,
  };

  await sqlRun(
    `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, old_value, new_value, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.user_id, payload.action, payload.entity, payload.entity_id, payload.old_value, payload.new_value, payload.ip_address]
  );

  return payload;
};
