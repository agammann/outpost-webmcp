'use strict';

// This is a fixed safety limit; caller options cannot disable it.
const MAX_DEPTH = 64;
const checkDepth = depth => {
  if (depth > MAX_DEPTH) {
    const error = new RangeError(`Brace pattern nesting exceeds ${MAX_DEPTH} levels`);
    error.code = 'ERR_BRACES_DEPTH';
    throw error;
  }
};

module.exports = { MAX_DEPTH, checkDepth };
