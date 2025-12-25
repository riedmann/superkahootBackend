// game.interface.js
// Interface for a game object in SuperKahoot

/**
 * @typedef {Object} Game
 * @property {string} state - Current state of the game (e.g., 'waiting', 'started', 'finished')
 * @property {Array<Object>} players - List of player objects
 * @property {number} [currentQuestionIndex] - Index of the current question
 * @property {Object} quizData - Quiz data, must include a 'questions' array
 * @property {Array<Object>} [questions] - (Optional) Array of questions (legacy or alternate structure)
 */

// Example usage:
// /** @type {Game} */
// const game = { ... };
