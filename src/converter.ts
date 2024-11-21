"use strict";

import * as process from "node:process";
import fs from "fs";

import minimist, {ParsedArgs} from "minimist";

import {
    PrizeWinners,
} from "./v1models";
import {Award, AwardRegistry, EventRecord, RaceRecord} from "./v2models";
import {loadV1Winners} from "./v1loaders";


// --target=./winners.csv
// --user=wghilliard
// --output=registry.json
// e.g. node ./converter.js --target=./winners.csv -user=wghilliard --output=award_registry.json
function main(): void {
    const argv: ParsedArgs = minimist(process.argv.slice(2));
    console.log(argv);

    const target: string = "winners.csv";
    const user: string = "wghilliard";
    const output: string = "award_registry.json";


    // const target: string = argv.target;
    // const user: string = argv.user;
    // const output: string = argv.output;

    if (target == null) {
        console.log("no --target specified, exiting;");
        process.exit(1);
    }

    if (user == null) {
        console.log("no --user specified, exiting;");
        process.exit(1);
    }

    if (output == null) {
        console.log("no --output specified, exiting;");
        process.exit(1);
    }

    const prizeWinners: PrizeWinners = loadV1Winners(target);

    if (prizeWinners == undefined)
    {
        console.log(`could not load winners from ${target}`);
        process.exit(1);
    }

    const registry = new AwardRegistry(user);
    const now = new Date().toLocaleDateString("en-CA");

    for (const winners of prizeWinners.winners.values()) {
        if (winners == undefined) {
            continue;
        }

        for (const winner of winners.values()) {
            if (winner == undefined) {
                continue;
            }

            const awards = new Array<Award>();

            if (winner._425) {
                awards.push(new Award(winner._425, "425 Motorsports", `__425_${winner.prizeType}_award__value__`));
            }

            if (winner.AAF) {
                awards.push(new Award(winner.AAF, "Advanced Auto Fabrication", `__AAF_${winner.prizeType}_award_value__`));
            }

            if (winner.Alpinestars) {
                awards.push(new Award(winner.Alpinestars, "Alpinestars", `__Alpinestars_${winner.prizeType}_award_value__`));
            }

            if (winner.Bimmerworld) {
                awards.push(new Award(winner.Bimmerworld, "Bimmerworld", `__Bimmerworld_${winner.prizeType}_award_value__`));
            }

            if (winner.Griots) {
                awards.push(new Award(winner.Griots, "Griots Garage", `__Griots_${winner.prizeType}_award_value__`));
            }

            if (winner.ProFormance) {
                awards.push(new Award(winner.ProFormance, "ProFormance Race School", `__ProFormance_${winner.prizeType}_award_value__`));
            }

            if (winner.Redline) {
                awards.push(new Award(winner.Redline, "Redline", `__Redline_${winner.prizeType}_award_value__`));
            }

            if (winner.RoR) {
                awards.push(new Award(winner.RoR, "Racers On Rails", `__RoR_${winner.prizeType}_award_value__`));
            }

            if (winner.Toyo) {
                awards.push(new Award(winner.Toyo, "Toyo Tires", `__Toyo_${winner.prizeType}_award_value__`));
            }

            if (winner.prizeType == "Weekend")
            {
                const eventRecord = upsertEventRecord(winner.eventName, registry.records);
                eventRecord.weekendAwards.push(...awards);
            }
            else {
                const raceRecord = upsertRaceRecord(winner.eventName, winner.id, registry.records, now);
                raceRecord.awards.push(...awards);
            }
        }
    }

    let totalAwardCount = 0;
    registry.records.forEach(record => {
        record.weekendAwards.sort((a, b) => a.driverName.localeCompare(b.driverName));
        console.log(`processed event=[${record.name}]weekendAwards.Length=[${record.weekendAwards.length}]`);
        totalAwardCount += record.weekendAwards.length;

        record.races.sort((a, b) => a.raceId - b.raceId);
        record.races.forEach(race => {
            console.log(`processed event=[${record.name}]raceId=[${race.raceId}]awards.Length=[${race.awards.length}]`);
            race.awards.sort((a, b) => a.driverName.localeCompare(b.driverName));
            totalAwardCount += race.awards.length;
        });
    });

    fs.writeFileSync(output, JSON.stringify(registry, null, 2));
    console.log(`wrote new registry w/ ${totalAwardCount} awards to ${output}`);
}


function upsertEventRecord(eventName: string, records: EventRecord[]): EventRecord
{
    for (const record of records) {
        if (record.name == eventName) {
            return record;
        }
    }

    const eventRecord = new EventRecord();
    eventRecord.name = eventName;
    eventRecord.races = new Array<RaceRecord>();
    eventRecord.weekendAwards = new Array<Award>();

    records.push(eventRecord);

    return eventRecord;
}

function upsertRaceRecord(eventName: string, raceId: number, records: EventRecord[], now: string): RaceRecord {
    const eventRecord = upsertEventRecord(eventName, records);

    for (const race of eventRecord.races) {
        if (race.raceId == raceId) {
            return race;
        }
    }

    const raceRecord = new RaceRecord();
    raceRecord.timestamp = now;
    raceRecord.raceId = raceId;
    raceRecord.awards = new Array<Award>();

    eventRecord.races.push(raceRecord);

    return raceRecord;
}

main();