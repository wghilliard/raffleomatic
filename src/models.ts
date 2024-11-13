"use strict";

export class Car {
    number: string;
    driverName: string;
    hasAllStickers: boolean;
    _425: boolean;
    AAF: boolean;
    Alpinestars: boolean;
    Bimmerworld: boolean;
    Griots: boolean;
    ProFormance: boolean;
    RoR: boolean;
    Redline: boolean;
    Toyo: boolean
}

export type CarNumber = string;

export function parseCarFromLine(line: string) : Car {
    // const [number, driver, all, _425, AAF, Aplinestars, Bimmerworld, Griots, ProFormance, RoR, Redline, Toyo]
    const values: string[] = line.split(",");
    const car =  new Car();
    car.number = values[0].trim();
    car.driverName = values[1].trim();
    car.hasAllStickers = Boolean(values[2]);
    car._425 = Boolean(values[3]);
    car.AAF = Boolean(values[4]);
    car.Alpinestars = Boolean(values[5]);
    car.Bimmerworld = Boolean(values[6]);
    car.Griots = Boolean(values[7]);
    car.ProFormance = Boolean(values[8]);
    car.RoR = Boolean(values[9]);
    car.Redline = Boolean(values[10]);
    car.Toyo = Boolean(values[11]);

    return car;
}

export class RaceResult{
    driverName: string;
    position: number;
    number: string;
    raceId: number;
    carClass: string;
    gap: string;
}

export function parseRaceResultFromLine(line: string, raceId: number) : RaceResult {
    const columns = line.split(",").map(value => value.replace(/^[\s\"]+/, "").replace(/[\s\"]+$/, ""));
    const raceResult = new RaceResult();
    raceResult.driverName = columns[0];
    raceResult.position = Number(columns[1]);
    // column 2 skipped
    raceResult.number = columns[3];
    raceResult.raceId = raceId;
    raceResult.carClass = columns[4];
    raceResult.gap = columns[5];

    return raceResult;
}

export class RaceResults {
    drives: RaceResult[];
    event: number;
}

export class PrizeDescriptor {
    sponsorName: string;
    prizeType: string;
    // race's value doesn't seem to be used
    races: number;
    perRace: number;
    perRaceCount: number;
    // weekend's value doesn't seem to be used
    weekend: number;
    perWeekend: number;
    perWeekendCount: number;
}

export function parsePrizeDescriptorFromLine(line: string): PrizeDescriptor {
    const columns = line.split(",").map(value => value.trim());
    const prizeDescriptor = new PrizeDescriptor();
    prizeDescriptor.sponsorName = columns[0];
    prizeDescriptor.prizeType = columns[1];
    prizeDescriptor.perRace = Number(columns[3]);
    prizeDescriptor.perRaceCount = Number(columns[4]);
    prizeDescriptor.weekend = Number(columns[5]);
    prizeDescriptor.perWeekendCount = Number(columns[6]);
    prizeDescriptor.perWeekend = Number(columns[7]);

    return prizeDescriptor;
}

export class Prize {
    sponsorName: string;
    prizeType: string;
    frequency: string;
    amount: number;
    raceId: number;

    constructor(sponsorName: string, prizeType: string, frequency: string, amount: number, raceId: number) {
        this.sponsorName = sponsorName;
        this.prizeType = prizeType;
        this.frequency = frequency;
        this.amount = amount;
        this.raceId = raceId;
    }
}

export class PrizeWinner {
    eventName: string;
    raceId: number;
    _425: string;
    AAF: string;
    Alpinestars: string;
    Bimmerworld: string;
    Griots: string;
    ProFormance: string;
    RoR: string;
    Redline: string;
    Toyo: string
}

export function parsePrizeWinnerFromLine(line: string, currentRaceNumber: number): PrizeWinner {
    const values = line.split(",").map(v => v.trim().replace(/\(.*\)$/, "").trim());
    if (!values.some(v => v)) {
        return null;
    }

    const winner = new PrizeWinner();
    winner.eventName = values[0];
    winner.raceId = values[1] ? parseInt(values[1].split(" ")[1]) : currentRaceNumber;
    winner._425 = values[2];
    winner.AAF = values[3];
    winner.Alpinestars = values[4];
    winner.Bimmerworld = values[5];
    winner.Griots = values[6];
    winner.ProFormance = values[7];
    winner.Redline = values[8];
    winner.RoR = values[9];
    winner.Toyo = values[10];

    return winner;
}

export class PrizeWinners {
    lastRace: number;
    winners: PrizeWinner[][];


    constructor(lastRace: number, winners: PrizeWinner[][]) {
        this.lastRace = lastRace;
        this.winners = winners;
    }
}

export class RoundResults {
    awarded: PrizeAward[];
    unawarded: Prize[];

    constructor(awarded: PrizeAward[], unawarded: Prize[]) {
        this.awarded = awarded;
        this.unawarded = unawarded;
    }
}

export class PrizeAward {
    prize: Prize;
    winner: RaceResult;
}

export type SponsorName = string;

export class WinnerSummary {
    byRace: Map<number, Map<SponsorName, PrizeAward[]>>
    weekend: Map<SponsorName, PrizeAward>
}