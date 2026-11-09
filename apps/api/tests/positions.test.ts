import assert from "node:assert/strict";
import { test } from "bun:test";
import { POSITION_GAP, positionAtIndex, positionsTooClose } from "@rinia/shared";

type Card = { id: string; number: number; position: number };

const byOrder = (left: Card, right: Card) => left.position - right.position || left.number - right.number;

/**
 * What the API does with a drop (see `respaceIfCrowded` in src/db/positions.ts): it saves the position, looks up the
 * moved card's nearest neighbours in the project, and when one is too close renumbers the whole order 1000 apart by
 * (position, number). Returns whether it respaced.
 */
function saveDrop(cards: Card[], movedId: string, position: number) {
    const moved = cards.find((card) => card.id === movedId)!;
    moved.position = position;
    const others = cards.filter((card) => card !== moved).map((card) => card.position);
    const before = Math.max(...others.filter((value) => value <= position));
    const after = Math.min(...others.filter((value) => value >= position));
    const crowded = positionsTooClose(Number.isFinite(before) ? before : null, position) || positionsTooClose(position, Number.isFinite(after) ? after : null);
    if (!crowded) return false;
    [...cards].sort(byOrder).forEach((card, index) => (card.position = (index + 1) * POSITION_GAP));
    return true;
}

/** What the board does on a drop: the card's place among the others, in the order they show, gives its position. */
function drop(cards: Card[], movedId: string, index: number) {
    const siblings = cards.filter((card) => card.id !== movedId).sort(byOrder);
    return saveDrop(cards, movedId, positionAtIndex(siblings, index));
}

function deck(count: number): Card[] {
    return Array.from({ length: count }, (_, index) => ({ id: `card-${index + 1}`, number: index + 1, position: (index + 1) * POSITION_GAP }));
}

function assertStrictOrder(cards: Card[], expected: string[], message: string) {
    const sorted = [...cards].sort(byOrder);
    assert.deepEqual(sorted.map((card) => card.id), expected, message);
    for (let index = 1; index < sorted.length; index++) {
        assert.ok(sorted[index - 1].position < sorted[index].position, `${message}: ${sorted[index - 1].id} and ${sorted[index].id} share a position`);
    }
}

test("dropping a card between the same two cards 1,000 times keeps a strict, distinct order", () => {
    // A and B start side by side; every drop takes the last card and puts it right after A, the tightest spot there is.
    const cards = deck(1002);
    const expected = cards.map((card) => card.id);
    let respacings = 0;
    for (let round = 1; round <= 1000; round++) {
        const moving = expected.pop()!;
        expected.splice(1, 0, moving);
        if (drop(cards, moving, 1)) respacings++;
        assertStrictOrder(cards, expected, `after drop ${round}`);
    }
    assert.equal(expected[0], "card-1");
    assert.equal(expected.at(-1), "card-2", "B ends up after every card dropped in front of it");
    assert.ok(respacings > 0, "the gap ran out at least once, and the order was spread out again");
    assert.ok(respacings <= 1000 / 25, `respacing stays rare (${respacings} times in 1,000 drops)`);
});

test("dropping 1,000 times right before the same card keeps a strict, distinct order", () => {
    const cards = deck(1002);
    const expected = cards.map((card) => card.id);
    for (let round = 1; round <= 1000; round++) {
        const moving = expected.pop()!;
        const target = expected.indexOf("card-2");
        expected.splice(target, 0, moving);
        drop(cards, moving, target);
        assertStrictOrder(cards, expected, `after drop ${round}`);
    }
});

test("the old float4 positions ran out after a couple of dozen drops", () => {
    // Why the columns are double precision now: the same drops, rounded to float4, meet within a few dozen rounds.
    let low = Math.fround(1000);
    let high = Math.fround(2000);
    let rounds = 0;
    while (low < high && rounds < 100) {
        high = Math.fround((low + high) / 2);
        rounds++;
    }
    assert.ok(rounds < 40, `float4 collided after ${rounds} drops`);
});

test("a card dropped at the top goes a full gap above the first one, even below zero", () => {
    assert.equal(positionAtIndex([{ position: 1000 }], 0), 0);
    assert.equal(positionAtIndex([{ position: 0 }], 0), -1000, "halving would have tied with the first card");
    assert.equal(positionAtIndex([{ position: -3000 }], 0), -4000, "halving would have put it below the first card");
    assert.equal(positionAtIndex([{ position: 1000 }], 1), 2000);
    assert.equal(positionAtIndex([], 0), 1000);
    assert.equal(positionAtIndex([{ position: 1000 }, { position: 2000 }], 1), 1500);
});

test("neighbours count as too close only when the gap nears the precision of their size", () => {
    assert.equal(positionsTooClose(1000, 2000), false);
    assert.equal(positionsTooClose(1000, 1000), true, "a shared position is always too close");
    assert.equal(positionsTooClose(1000, 1000 + 1e-3), false, "a thousandth is still plenty at this size");
    assert.equal(positionsTooClose(1000, 1000 + 1e-7), true);
    assert.equal(positionsTooClose(1e12, 1e12 + 1), true, "the threshold grows with the numbers");
    assert.equal(positionsTooClose(null, 5), false, "nothing on one side leaves room");
    assert.equal(positionsTooClose(5, undefined), false);
});
