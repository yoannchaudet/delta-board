import { getVisibleCards, getVoteCount } from './operations.js';

export function quorumNeeded(participantCount) {
    if (participantCount <= 2) return participantCount;
    return Math.ceil(0.6 * participantCount);
}

function formatCardMarkdown(state, card) {
    const votes = getVoteCount(state, card.id);
    const voteLabel = votes === 1 ? '1 vote' : `${votes} votes`;
    const lines = card.text.split('\n');
    const first = `- ${lines[0]}`;
    const rest = lines.slice(1).map(line => line ? `  ${line}` : '');
    return [first, ...rest].join('\n\n') + ` (${voteLabel})\n`;
}

export function generateMarkdown(boardId, state) {
    const wellCards = getVisibleCards(state, 'well')
        .sort((a, b) => getVoteCount(state, b.id) - getVoteCount(state, a.id));
    const deltaCards = getVisibleCards(state, 'delta')
        .sort((a, b) => getVoteCount(state, b.id) - getVoteCount(state, a.id));

    let markdown = `# ${boardId}\n\n`;

    markdown += '## What Went Well\n\n';
    if (wellCards.length === 0) {
        markdown += '_No cards._\n';
    } else {
        for (const card of wellCards) {
            markdown += formatCardMarkdown(state, card);
        }
    }

    markdown += '\n## Delta\n\n';
    if (deltaCards.length === 0) {
        markdown += '_No cards._\n';
    } else {
        for (const card of deltaCards) {
            markdown += formatCardMarkdown(state, card);
        }
    }

    return markdown;
}
