"use strict";

import {RaceNumber} from "./v1models";

export class AwardRegistry {
    records: EventRecord[];
    lastUpdatedDateTime: string;
    lastUpdatedBy: string;


    constructor(lastUpdatedBy: string) {
        this.lastUpdatedBy = lastUpdatedBy;
        this.lastUpdatedDateTime = new Date().toISOString();
        this.records = new Array<EventRecord>();
    }
}

export class EventRecord {
    name: string;
    races: RaceRecord[];
    weekendAwards: Award[];
}

export class RaceRecord {
    timestamp: string;
    raceId: number;
    awards: Award[];
}

export class Award {
    driverName: string;
    sponsorName: string;
    value: string;

    constructor(driverName: string, sponsorName: string, value: string) {
        this.driverName = driverName;
        this.sponsorName = sponsorName;
        this.value = value;
    }
}
