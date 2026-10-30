(function() {
  'use strict';

  var SUITS = [
    { code: 'S', symbol: '♠', color: 'black', name: 'Spades' },
    { code: 'H', symbol: '♥', color: 'red', name: 'Hearts' },
    { code: 'D', symbol: '♦', color: 'red', name: 'Diamonds' },
    { code: 'C', symbol: '♣', color: 'black', name: 'Clubs' }
  ];

  var RANKS = [
    { value: 14, label: 'A' },
    { value: 13, label: 'K' },
    { value: 12, label: 'Q' },
    { value: 11, label: 'J' },
    { value: 10, label: '10' },
    { value: 9, label: '9' },
    { value: 8, label: '8' },
    { value: 7, label: '7' },
    { value: 6, label: '6' },
    { value: 5, label: '5' },
    { value: 4, label: '4' },
    { value: 3, label: '3' },
    { value: 2, label: '2' }
  ];

  var HAND_RANKS = {
    TRAIL: { id: 6, name: 'Trail / Trio', desc: 'Three cards of the same rank' },
    PURE_SEQUENCE: { id: 5, name: 'Pure Sequence', desc: 'Three consecutive cards of the same suit' },
    SEQUENCE: { id: 4, name: 'Sequence', desc: 'Three consecutive cards of mixed suits' },
    COLOR: { id: 3, name: 'Color / Flush', desc: 'Three cards of the same suit' },
    PAIR: { id: 2, name: 'Pair', desc: 'Two cards of the same rank' },
    HIGH_CARD: { id: 1, name: 'High Card', desc: 'No pair or sequence, highest card rules' }
  };

  function createDeck() {
    var deck = [];
    for (var s = 0; s < SUITS.length; s++) {
      for (var r = 0; r < RANKS.length; r++) {
        deck.push({
          suit: SUITS[s].code,
          suitSymbol: SUITS[s].symbol,
          color: SUITS[s].color,
          rank: RANKS[r].value,
          label: RANKS[r].label,
          name: RANKS[r].label + SUITS[s].symbol,
          id: RANKS[r].label + '_' + SUITS[s].code
        });
      }
    }

    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = deck[i];
      deck[i] = deck[j];
      deck[j] = temp;
    }

    return deck;
  }

  function dealCards(deck, count) {
    if (!deck || deck.length < count) {
      deck = createDeck();
    }
    return deck.splice(0, count);
  }

  function getSequenceValue(r1, r2, r3) {
    if (r1 === 14 && r2 === 13 && r3 === 12) return 14; // A-K-Q (highest)
    if (r1 === 14 && r2 === 3 && r3 === 2) return 13.5; // A-2-3 (2nd highest)
    if (r1 === r2 + 1 && r2 === r3 + 1) return r1;     // K-Q-J down to 4-3-2
    return 0;
  }

  function evaluateHand(cards) {
    if (!cards || cards.length !== 3) {
      return {
        category: HAND_RANKS.HIGH_CARD.id,
        categoryName: HAND_RANKS.HIGH_CARD.name,
        vector: [0, 0, 0, 0],
        description: 'Invalid Hand',
        cards: cards || []
      };
    }

    var sorted = cards.slice().sort(function(a, b) {
      return b.rank - a.rank;
    });

    var r1 = sorted[0].rank;
    var r2 = sorted[1].rank;
    var r3 = sorted[2].rank;

    var isFlush = (sorted[0].suit === sorted[1].suit) && (sorted[1].suit === sorted[2].suit);
    var seqVal = getSequenceValue(r1, r2, r3);
    var isSeq = seqVal > 0;

    // 1. Trail / Three of a Kind
    if (r1 === r2 && r2 === r3) {
      return {
        category: HAND_RANKS.TRAIL.id,
        categoryName: HAND_RANKS.TRAIL.name,
        vector: [HAND_RANKS.TRAIL.id, r1, 0, 0],
        description: 'Trail of ' + sorted[0].label + "'s",
        cards: sorted
      };
    }

    // 2. Pure Sequence (Straight Flush)
    if (isFlush && isSeq) {
      var seqLabel = seqVal === 13.5 ? 'A-2-3' : (sorted[0].label + '-' + sorted[1].label + '-' + sorted[2].label);
      return {
        category: HAND_RANKS.PURE_SEQUENCE.id,
        categoryName: HAND_RANKS.PURE_SEQUENCE.name,
        vector: [HAND_RANKS.PURE_SEQUENCE.id, seqVal, 0, 0],
        description: 'Pure Sequence (' + seqLabel + ')',
        cards: sorted
      };
    }

    // 3. Sequence (Straight)
    if (isSeq) {
      var seqLabelStd = seqVal === 13.5 ? 'A-2-3' : (sorted[0].label + '-' + sorted[1].label + '-' + sorted[2].label);
      return {
        category: HAND_RANKS.SEQUENCE.id,
        categoryName: HAND_RANKS.SEQUENCE.name,
        vector: [HAND_RANKS.SEQUENCE.id, seqVal, 0, 0],
        description: 'Sequence (' + seqLabelStd + ')',
        cards: sorted
      };
    }

    // 4. Color / Flush
    if (isFlush) {
      return {
        category: HAND_RANKS.COLOR.id,
        categoryName: HAND_RANKS.COLOR.name,
        vector: [HAND_RANKS.COLOR.id, r1, r2, r3],
        description: 'Flush ' + sorted[0].suitSymbol + ' (' + sorted[0].label + ' High)',
        cards: sorted
      };
    }

    // 5. Pair
    if (r1 === r2 || r2 === r3 || r1 === r3) {
      var pairRank = 0;
      var kicker = 0;
      if (r1 === r2) {
        pairRank = r1;
        kicker = r3;
      } else if (r2 === r3) {
        pairRank = r2;
        kicker = r1;
      } else {
        pairRank = r1;
        kicker = r2;
      }

      var pairLabel = RANKS.find(function(r) { return r.value === pairRank; }).label;
      var kickerLabel = RANKS.find(function(r) { return r.value === kicker; }).label;

      return {
        category: HAND_RANKS.PAIR.id,
        categoryName: HAND_RANKS.PAIR.name,
        vector: [HAND_RANKS.PAIR.id, pairRank, kicker, 0],
        description: 'Pair of ' + pairLabel + "'s (" + kickerLabel + ' Kicker)',
        cards: sorted
      };
    }

    // 6. High Card
    return {
      category: HAND_RANKS.HIGH_CARD.id,
      categoryName: HAND_RANKS.HIGH_CARD.name,
      vector: [HAND_RANKS.HIGH_CARD.id, r1, r2, r3],
      description: sorted[0].label + ' High (' + sorted[0].label + ', ' + sorted[1].label + ', ' + sorted[2].label + ')',
      cards: sorted
    };
  }

  function compareHands(handA, handB) {
    var evalA = handA.vector ? handA : evaluateHand(handA);
    var evalB = handB.vector ? handB : evaluateHand(handB);

    for (var i = 0; i < evalA.vector.length; i++) {
      if (evalA.vector[i] > evalB.vector[i]) return 1;
      if (evalA.vector[i] < evalB.vector[i]) return -1;
    }
    return 0;
  }

  window.HAND_RANKS = HAND_RANKS;
  window.createDeck = createDeck;
  window.dealCards = dealCards;
  window.evaluateHand = evaluateHand;
  window.compareHands = compareHands;

})();
