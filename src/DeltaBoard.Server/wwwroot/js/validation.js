// Validation Module - Protocol validation for incoming and local operations

/**
 * @typedef {import('./types.js').BoardState} BoardState
 */

function isValidPhaseValue(phase) {
    return phase === 'forming' || phase === 'reviewing';
}

function shouldRejectForPhase(messagePhase, localPhase) {
    // Spec: if local is reviewing and incoming is forming, reject
    return localPhase === 'reviewing' && messagePhase === 'forming';
}

function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}

function getCardRev(state, cardId) {
    const card = state.cards.find(c => c.id === cardId);
    return card ? card.rev : null;
}

function getVoteRev(state, cardId, voterId) {
    const voteId = `${cardId}:${voterId}`;
    const vote = state.votes.find(v => v.id === voteId);
    return vote ? vote.rev : null;
}

function validateCommonOp(op, localPhase) {
    if (!op || !isValidPhaseValue(op.phase)) return false;
    if (shouldRejectForPhase(op.phase, localPhase)) return false;
    return true;
}

export function validateIncomingCardOp(op, state, localPhase) {
    if (!op || op.type !== 'cardOp' || !op.opId) return false;
    if (!validateCommonOp(op, localPhase)) return false;
    if (!op.senderId) return false;
    if (!op.cardId || !op.authorId) return false;
    if (!isFiniteNumber(op.rev) || op.rev < 1) return false;
    if (op.action !== 'create' && op.action !== 'edit' && op.action !== 'delete') return false;
    if (op.action === 'create' && (!op.column || !op.text)) return false;
    if (op.authorId !== op.senderId) return false;

    const existingRev = getCardRev(state, op.cardId);
    if (existingRev !== null && op.rev < existingRev) return false;

    return true;
}

export function validateIncomingVoteOp(op, state, localPhase) {
    if (!op || op.type !== 'vote' || !op.opId) return false;
    if (!validateCommonOp(op, localPhase)) return false;
    if (!op.senderId) return false;
    if (!op.cardId || !op.voterId) return false;
    if (!isFiniteNumber(op.rev) || op.rev < 1) return false;
    if (op.action !== 'add' && op.action !== 'remove') return false;
    if (op.voterId !== op.senderId) return false;

    const existingRev = getVoteRev(state, op.cardId, op.voterId);
    if (existingRev !== null && op.rev < existingRev) return false;

    return true;
}

export function validateIncomingPhaseChange(op, localPhase) {
    if (!op || op.type !== 'phaseChanged' || !op.opId) return false;
    if (!validateCommonOp(op, localPhase)) return false;
    if (!op.senderId) return false;
    return true;
}

export function validateLocalCardOp(op, state, localPhase, localClientId) {
    if (!op || op.type !== 'cardOp') return false;
    if (op.authorId !== localClientId) return false;
    if (op.phase !== localPhase) return false;
    if (!op.cardId) return false;
    if (!isFiniteNumber(op.rev) || op.rev < 1) return false;
    if (op.action !== 'create' && op.action !== 'edit' && op.action !== 'delete') return false;
    if (op.action === 'create' && (!op.column || !op.text)) return false;

    const existingRev = getCardRev(state, op.cardId);
    const expectedRev = existingRev === null ? 1 : existingRev + 1;
    if (op.rev !== expectedRev) return false;

    return true;
}

export function validateLocalVoteOp(op, state, localPhase, localClientId) {
    if (!op || op.type !== 'vote') return false;
    if (op.voterId !== localClientId) return false;
    if (op.phase !== localPhase) return false;
    if (!op.cardId) return false;
    if (!isFiniteNumber(op.rev) || op.rev < 1) return false;
    if (op.action !== 'add' && op.action !== 'remove') return false;

    const existingRev = getVoteRev(state, op.cardId, op.voterId);
    const expectedRev = existingRev === null ? 1 : existingRev + 1;
    if (op.rev !== expectedRev) return false;

    return true;
}
