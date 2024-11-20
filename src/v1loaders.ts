// Load the previous winners and identify the number of the last race.
import {parsePrizeWinnerFromLine, PrizeWinner, PrizeWinners, RaceNumber} from "./v1models";
import fs from "fs";

export function loadV1Winners(filename: string): PrizeWinners {
    const data: string = fs.readFileSync(filename).toString();
    let raceNumber = 0;
    let raceName: string = "_uninitialized";
    const winners: Map<RaceNumber, PrizeWinner[]> = data.split("\n").reduce((result, line: string, index: number) => {
        // skips the header and example lines
        if (index <= 1 || !line) {
            return result;
        }
        // const values = line.split(',').map(v => v.trim().replace(/\(.*\)$/, '').trim())
        // if (!values.some(v => v)) {
        //   return result
        // }
        // todo wgh - this file swaps indexes of RoR and Redline as compared to the Car file
        // let [event, race, _425, AAF, Aplinestars, Bimmerworld, Griots, ProFormance, Redline, RoR, Toyo] = values
        // raceNumber = race ? parseInt(race.split(' ')[1]) : raceNumber
        const maybeWinner = parsePrizeWinnerFromLine(line, raceNumber, raceName);
        if (maybeWinner.skip)
        {
            return result;
        }

        if (maybeWinner.currentRaceName)
        {
            raceName = maybeWinner.currentRaceName;
            return result;
        }

        const winner = maybeWinner.winner;
        raceNumber = winner.id;
        raceName = winner.eventName;

        // todo - wgh - no winners found exit condition?
        // if (!raceNumber) {
        //     return result;
        // }

        if (!result.get(raceNumber))
        {
            result.set(raceNumber, new Array<PrizeWinner>());
        }

        // result[raceNumber].push({ raceNumber, event, _425, AAF, Aplinestars, Bimmerworld, Griots, ProFormance, Redline, RoR, Toyo })
        result.get(raceNumber).push(winner);
        return result;
    }, new Map<RaceNumber, PrizeWinner[]>());

    if (winners.size === 0) {
        return { lastRace: 0, winners };
    }
    // return { lastRace: winners[winners.length - 1][0].raceNumber, winners }
    const lastRace: RaceNumber = [...winners.keys()].reduce((latest: number, currentValue: number) => Math.max(latest, currentValue), 0);
    return new PrizeWinners(lastRace, winners);
}