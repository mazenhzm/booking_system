export const isValidUuid = (value) => {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
};

export const requireUuid = (value, fieldName = 'ID') => {
  if (!isValidUuid(value)) {
    const error = new Error(`${fieldName} must be a valid UUID.`);
    error.statusCode = 400;
    throw error;
  }

  return value;
};
