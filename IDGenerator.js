let counter = 1;
let seqCounter = 1;

export function generatePaddedUniqueSeqId() {
    const baseId = generateUniqueSeqId(9);
    const paddedNumber = seqCounter.toString().padStart(4, '0');
    seqCounter++;
    return baseId + paddedNumber;
}

function generateUniqueSeqId(length = 9) {
    return 'sid-' + Math.random().toString(36).substr(2, length);
}

export function generatePaddedUniqueId() {
    const baseId = generateUniqueId(9);
    const paddedNumber = counter.toString().padStart(4, '0');
    counter++;
    return baseId + paddedNumber;
}

function generateUniqueId(length = 9) {
    return 'id-' + Math.random().toString(36).substr(2, length);
}