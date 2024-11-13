// PRO3 Raffle logic
// We have N sponsors each of which provide X prizes per race and/or Y prizes per weekend. 
// Some sponsors provide multiple different prizes per time point (e.g., $$ and gift cards per race/weekend)
//
// We have R runs/drives (must have started the race) per weekend in C cars with D drivers 
// (car sharing and swapping is a thing). Each car has some number of sponsor stickers and each driver runs in 
// some number of races per weekend
//
// Raffle goal: Fair and random with prizes awarded proportional to driver participation -- The more you sticker 
// and drive, the more chances you have to win.
//
// Raffle process: Prizes are awarded in random order, to the driver of a randomly selected eligible drive. 
// A drive is eligible for a given prize if:
// * The car sports the prize sponsor's sticker
// * The drive is in the prize's race (only checked for per-race prizes)
// * The driver has not yet won a prize in the current raffle round
// * The driver has not yet won a prize from the prize sponsor in the current raffle round
// * For Toyo Bucks prizes, the driver has not won the prize in the last 9 races. (spreads the love while retaining
//   the participation weighting)
//
// Given the large number of sponsors, it is possible for one driver to win multiple prizes and another to 
// win none. This happens when drawing for a prize and the pool of eligble drives is empty (all drivers 
// have won a prize or remaining cars in that race do not have the sponsor stickers). Luck of the draw.
//
// In theory it's possible to optimize the logic to eliminate/reduce multi-winners. For example, if, upon discovering 
// a duplicate winner, we rejigged prior results, we could ensure someone is always eligible for a given prize. 
// However, that is both complicated and actually rewards people for missing stickers/races.
// 
// Instead, we have opted to mimic a real life raffle such that once a prize is awarded, it's awarded. When a prize 
// cannot be awarded (no one is eligible), it is set aside. After round is complete, we do another full drawing
// round for any remaining prizes with all drivers once again eligible. Rinse and repeat until all prizes are awarded.

import fs from "fs";
import {
  Car,
  CarNumber,
  parseCarFromLine, parsePrizeDescriptorFromLine,
  parsePrizeWinnerFromLine, parseRaceResultFromLine,
  Prize, PrizeAward, PrizeDescriptor,
  PrizeWinner,
  PrizeWinners,
  RaceResult, RaceResults, RoundResults, SponsorName, WinnerSummary
} from "./models";
import * as process from "node:process";

function randomize(array: Prize[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

// Load all the cars and what stickers they have. Note that there can be issues if cars change numbers
// especially if they switch back and forth. Basically this is a "per-iteration" dataset to just change 
// the data and run the raffle. You should ge at a warning if there are drives in unknown cars. 
function loadCars(filename: string) : Map<CarNumber, Car> {
  const carData: string = fs.readFileSync(filename).toString();
  return carData.split("\n").reduce((result, line: string, index: number) => {
    // skip the header
    if (index === 0 || !line)
      return result;
    // const [number, driver, all, _425, AAF, Aplinestars, Bimmerworld, Griots, ProFormance, RoR, Redline, Toyo] = line.split(',').map((value, index) => index > 1 ? Boolean(value) : value.trim())
    const car = parseCarFromLine(line);
    result.set(car.number, car);
    return result;
  }, new Map<CarNumber, Car>());
}

// Load the previous winners and identify the number of the last race.
function loadWinners(filename: string): PrizeWinners {
  const data: string = fs.readFileSync(filename).toString();
  let raceNumber = 0;
  const winners: PrizeWinner[][] = data.split("\n").reduce((result, line: string, index: number) => {
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
    const winner = parsePrizeWinnerFromLine(line, raceNumber);
    raceNumber = winner ? winner.raceId: raceNumber;

    // todo - wgh - no winners found exit condition?
    if (!raceNumber) {
      return result;
    }

    result[raceNumber] = result[raceNumber] || [];
    // result[raceNumber].push({ raceNumber, event, _425, AAF, Aplinestars, Bimmerworld, Griots, ProFormance, Redline, RoR, Toyo })
    result[raceNumber].push(winner);
    return result;
  }, []);

  if (winners.length === 0) {
    return { lastRace: 0, winners };
  }
  // return { lastRace: winners[winners.length - 1][0].raceNumber, winners }
  return new PrizeWinners(winners[winners.length - 1][0].raceId, winners);
}

// Load the prizes for each sponsor and track the amounts and whether they are per race or per weekend. 
function loadPrizes(filename: string, drives: RaceResult[]): Prize[] {
  const raceCounts: Map<number, number> = drives.reduce((result, drive: RaceResult) => {
    const count: number = result[drive.raceId] || 0;
    result.set(drive.raceId, count + 1);
    return result;
  }, new Map<number, number>());

  // todo - wgh - this is always 3 right?
  const raceCount = Object.keys(raceCounts).length;

  const sponsorData: string = fs.readFileSync(filename).toString();
  const prizes: Prize[] = sponsorData.split("\n").reduce((result: Prize[], line: string, index: number): Prize[] => {
    if (index === 0)
    {
      return result;
    }
    // const [sponsor, type, races, perRace, perRaceCount, weekend, perWeekendCount, perWeekend] = line.split(',').map(value => value.trim())
    const prizeDescriptor: PrizeDescriptor = parsePrizeDescriptorFromLine(line);
    for (let race = 1; race <= raceCount; race++) {
      for (let i = 0; i < prizeDescriptor.perRaceCount; i++) {
        // result.push({sponsor, type, frequency: 'race', race, amount: perRace})
        result.push(new Prize(prizeDescriptor.sponsorName, prizeDescriptor.prizeType, "race", prizeDescriptor.perRace, race));
      }
    }
    for (let i = 0; i < prizeDescriptor.perWeekendCount; i++) {
      // result.push({sponsor, type, frequency: 'weekend', amount: perWeekend})
      result.push(new Prize(prizeDescriptor.sponsorName, prizeDescriptor.prizeType, "weekend", prizeDescriptor.perRace, 0));
    }
    return result;
  }, []);
  setToyoAmounts(prizes, raceCounts);
  // randomize the prizes to be won so we're not always picking in the same order. As we
  // we award prizes the pool of candidates shrinks so if we always did the prizes in the same order, 
  // you can game the system by, for example, leaving off stickers for sponsors you don't want and 
  // thus increasing your chances of winning one of the later prizes (you're more likely to be left 
  // in the pool).
  randomize(prizes);
  return prizes;
}

function setToyoAmounts(prizes: Prize[], raceCounts: Map<number, number>) {
  // 3-5: $85, 6-10: $175, 11-15: $265, 16-20: $355, 21-24: $440, 25-30: $550, 31+: $600.
  const countTable = [0, 0, 0, 85, 85, 85, 175, 175, 175, 175, 175, 265, 265, 265, 265, 265, 355, 355, 355, 355, 355, 440, 440, 440, 440, 550, 550, 550, 550, 550, 550, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600];
  prizes.forEach(prize => {
    if (prize.sponsorName === "Toyo") prize.amount = countTable[raceCounts[prize.raceId]];
  });
}

// Load a set of drives from the RaceHero results data file. This is hardcoded to the current data format so 
// must be updated if there are changes or a different data provider is used (e.g., the Mission races
// use some other system). Note that we also try to parse out the "event name" so it's easier to track and
// report the raffle results.
function loadRace(raceId: number, filename: string): RaceResults {
  try {
    const resultsData: string = fs.readFileSync(filename).toString();
    const results: RaceResult[] = resultsData.split("\n").map(line => {
      // const columns = line.split(',').map(value => value.replace(/^[\s\"]+/, '').replace(/[\s\"]+$/, ''))
      // return { driver: columns[0], position: columns[1], number: columns[3], race, class: columns[4], gap: columns[9] }
      return parseRaceResultFromLine(line, raceId);
    });
    const drives: RaceResult[] = results
      .filter(result => result.carClass === "PRO3" && result.gap !== "DNS");
      // .map(result => {
      //       // return { driver: result.driver, number: result.number, race: result.race } }
      //       return new Drive(result.driverName, result.number, result.raceId);
      //     }
      // );

    // why get second place?
    const event: number = results[1].position;
    return { event, drives };
  } catch (e) { return { event: null, drives: [] }; }
}

// Load all the individual drives from a set of up to three race results from a weekend. Missing results
// files are ignored.
function loadDrives(): RaceResults {
  // todo - wgh - we might consider the names of these files
  const results: RaceResults = loadRace(1, "results1.csv");
  const event: number = results.event;
  const drives: RaceResult[] = results.drives;
  drives.push(...loadRace(2, "results2.csv").drives);
  drives.push(...loadRace(3, "results3.csv").drives);
  return { event: event, drives: drives.filter(Boolean) };
}

// Get the set of possible winners for a prize in a given set of drives in light of who has already won
// and which stickers they have displayed.
function getCandidates(drives: RaceResult[], prize: Prize, awarded: PrizeAward[], winners: RaceResult[], cars: Map<CarNumber, Car>, previousWinners: PrizeWinner[][]) {
  return drives.filter(drive =>
      (!prize.raceId || prize.raceId === drive.raceId)
      && hasSticker(cars, drive.number, prize.sponsorName)
      && !winners.some(winner => winner.driverName === drive.driverName)
      && !(awarded.some(award => award.winner.driverName === drive.driverName && award.prize.sponsorName === prize.sponsorName))
      && !(prize.sponsorName === "Toyo" && hasWonToyo(drive.driverName, previousWinners)));
}

function hasSticker(cars: Map<CarNumber, Car>, carNumber: string, sponsorName: string): boolean {
  const car = cars[carNumber];
  const result = car && car[sponsorName];
  return result;
}

function hasWonToyo(driver, previousWinners) {
  // Drivers cannot have won in the previous 9 races. 9 is magic as it is raceCount / 2 + 1.
  // That means that no driver can win more then twice in a season.
  const windowSize = Math.min(previousWinners.length - 1, 9);
  const windowStart = previousWinners.length - windowSize;
  for (let i = windowStart; i < previousWinners.length; i++) {
    for (let j = 0; j < previousWinners[i].length; j++) {
      const record = previousWinners[i][j];
      if (record.Toyo && record.Toyo === driver)
        return true;
    }
  }
  return false;
}

function validateCarsAndDrives(cars: Map<CarNumber, Car>, drives: RaceResult[]): void {
  const drivesMissingCars = drives.filter(drive => !cars[drive.number]);
  if (drivesMissingCars.length > 0)
    console.log(`Some drives were in an unknown car\n${JSON.stringify(drivesMissingCars, null, 2)}`);
}

function draw(awarded: PrizeAward[], prizes: Prize[], drives: RaceResult[], cars: Map<CarNumber, Car>, previousWinners: PrizeWinner[][]): RoundResults {
  const winners: RaceResult[] = [];
  const unawarded: Prize[] = [];
  const results: PrizeAward[] = prizes.reduce((result: PrizeAward[] , prize: Prize): PrizeAward[] => {
    const candidates = getCandidates(drives, prize, awarded, winners, cars, previousWinners);
    if (!candidates.length) {
      // for whatever reason, there are no candidates (likely already exhausted the pool for this prize)
      // so just track the prize as unawarded and move on
      unawarded.push(prize);
      return result;
    }
    const winnerIndex = Math.floor(Math.random() * candidates.length);
    const winner = candidates[winnerIndex];
    winners.push(winner);
    result.push({ prize, winner });
    return result;
  }, []);
  return { awarded: results, unawarded };
}

function groupResults(results: PrizeAward[]): Map<string, RaceResult[]> {
  return results.reduce((result: Map<string, RaceResult[]>, entry: PrizeAward) => {
    const { sponsorName, prizeType, raceId, amount } = entry.prize;
    const frequencyText = raceId ? `(Race #${raceId})` : "(Weekend)";
    const key = `${sponsorName.replace(/^_+/, "")} -- $${amount} ${prizeType} ${frequencyText}`;
    if (!result.get(key)) {
      result.set(key, new Array<RaceResult>());
    }
    if (entry.winner)
      result.get(key).push(entry.winner);
    return result;
  }, new Map<string, RaceResult[]>());
}

function presentResults(results: PrizeAward[]) {
  const grouped = groupResults(results);
  const sorted = Object.keys(grouped).sort();
  sorted.forEach(key => {
    const winners = grouped.get(key);
    if (!winners || !winners.length) {
      return console.log(`${key}: Unclaimed`);
    }
    const winnersText = winners.map(winner => `${winner.driverName} #${winner.number}`).join(", ");
    console.log(`${key}: ${winnersText}`);
  });
}

function summarizeRaffle(prizes: Prize[], drives: RaceResult[], awarded: PrizeAward[]): void {
  const winnerCounts: Map<string, number> = awarded.reduce((result, current: PrizeAward) => {
    const driver: string = current.winner.driverName;
    result[driver] ? ++result[driver] : result[driver] = 1;
    return result;
  }, new Map<string, number>());
  const drivers: string[] = Array.from(new Set(drives.map(drive => drive.driverName)));
  console.log(`${prizes.length} prizes`);
  console.log(`${drives.length} drives by ${drivers.length} drivers`);
  console.log(`${Object.keys(winnerCounts).length} unique winners`);
  const realDupes: Map<string, number> = Object.keys(winnerCounts).reduce((result, key: string) => {
    if (winnerCounts[key] > 1)
      result[key] = winnerCounts[key];
    return result;
  }, new Map<string, number>());
  const sorted = Object.fromEntries(
    Object.entries(realDupes).sort((a, b) => a[1] - b[1])
  );
  console.log(`${Object.keys(sorted).length} duplicate winners`);
  if (Object.keys(sorted).length) console.log(JSON.stringify(sorted, null, 2));
}

function recordWinners(lastRace: number, previous: number, awarded: PrizeAward[]): void {
  const { byRace, weekend } : WinnerSummary = awarded.reduce((result, entry) => {
    if (entry.prize.frequency === "weekend")
      result.weekend[entry.prize.sponsorName] = entry;
    else {
      const race = entry.prize.raceId + lastRace;
      const raceEntry = result.byRace[race] = result.byRace[race] || new Map<SponsorName, PrizeAward[]>();
      raceEntry[entry.prize.sponsorName] = raceEntry[entry.prize.sponsorName] || new Array<PrizeAward>();
      raceEntry[entry.prize.sponsorName].push(entry);
    }
    return result;
  }, new WinnerSummary());

  const columns = ["_425", "AAF", "Aplinestars", "Bimmerworld", "Griots", "ProFormance", "Redline", "RoR", "Toyo"];
  const weekendString = columns.map(column => weekend.get(column)
    ? `${weekend.get(column).winner.driverName} (${weekend.get(column).prize.prizeType})`
    : "").join(",");
  let final = previous + ",," + weekendString + "\n";
  for (const race in byRace)
    for (let i = 0; i < 4; i++) {
      const entry: Map<SponsorName, PrizeAward[]> = byRace[race];
      const raceId = i === 0 ? `Race ${race}` : "";
      const text = columns.map(column => {
        if (!Array.isArray(entry[column])) {
          return entry[column];
        }
        if (!entry[column][i]) {
          return "";
        }
        if (entry[column][i].winner) {
          return `${entry[column][i].winner.driver} (${entry[column][i].prize.type})`;
        }
        return entry[column][i];
      }).join(",");
      final = final + "," + raceId + "" + text + "\n";
    }
  console.log(final);
}

// Load and validate the cars, drives, prizes and previous winners
const cars: Map<CarNumber, Car> = loadCars("cars.csv");
console.log(`loaded ${cars.size} cars`);
const raceResults: RaceResults = loadDrives();
if (raceResults.drives.length == 0) {
  console.log("no results found, exiting");
  process.exit();
}

console.log(`loaded ${raceResults.drives.length} results, using event ${raceResults.event}`);
validateCarsAndDrives(cars, raceResults.drives);
const prizes: Prize[] = loadPrizes("sponsors.csv", raceResults.drives);
console.log(`loaded ${prizes.length} prizes`);
const { lastRace, winners }: PrizeWinners = loadWinners("winners.csv");

// do the drawing repeatedly until there all prizes are awarded. Repetition is likely when there are more
// prizes than drivers and/or cars do not sport all stickers.
const awarded = [];
let unawarded: Prize[] = prizes;
let round: number = 1;
while (unawarded.length > 0 && round < 5) {
  console.log(`Running round ${round} for ${unawarded.length} prizes`);
  const { awarded: newlyAwarded, unawarded: remainingUnawarded }: RoundResults = draw(awarded, unawarded, raceResults.drives, cars, winners);
  awarded.push(...newlyAwarded);
  unawarded = remainingUnawarded;
  round++;
}
if (unawarded.length) {
  console.log(`ERROR: Still could not award all prizes after ${round} rounds!`);
  // process.exit(1);
}
summarizeRaffle(prizes, raceResults.drives, awarded);
console.log("");
presentResults(awarded);
console.log("");
recordWinners(lastRace, raceResults.event, awarded);

