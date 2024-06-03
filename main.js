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

const fs = require('fs')

function randomize(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }
}

// Load all the cars and what stickers they have. Note that there can be issues if cars change numbers
// especially if they switch back and forth. Basically this is a "per-iteration" dataset to just change 
// the data and run the raffle. You should ge at a warning if there are drives in unknown cars. 
function loadCars(filename) {
  const carData = fs.readFileSync(filename).toString()
  return carData.split('\n').reduce((result, line, index) => {
    if (index === 0 || !line) return result
    const [number, driver, all, _425, AAF, Aplinestars, Bimmerworld, Griots, ProFormance, RoR, Redline, Toyo] =
      line.split(',').map((value, index) => index > 1 ? Boolean(value) : value.trim())
    result[number] = { number, _425, AAF, Aplinestars, Bimmerworld, Griots, Redline, RoR, Toyo }
    return result
  }, {})
}

// Load the previous winners and identify the number of the last race.
function loadWinners(filename) {
  const data = fs.readFileSync(filename).toString()
  let raceNumber = 0
  const winners = data.split('\n').reduce((result, line, index) => {
    if (index <= 1 || !line) return result
    const values = line.split(',').map(v => v.trim().replace(/\(.*\)$/, '').trim())
    if (!values.some(v => v)) return result
    let [event, race, _425, AAF, Aplinestars, Bimmerworld, Griots, ProFormance, Redline, RoR, Toyo] = values
    raceNumber = race ? parseInt(race.split(' ')[1]) : raceNumber
    if (!raceNumber) return result
    result[raceNumber] = result[raceNumber] || []
    result[raceNumber].push({ raceNumber, event, _425, AAF, Aplinestars, Bimmerworld, Griots, ProFormance, Redline, RoR, Toyo })
    return result
  }, [])
  if (winners.length === 0) return { lastRace: 0, winners }
  return { lastRace: winners[winners.length - 1][0].raceNumber, winners }
}

// Load the prizes for each sponsor and track the amounts and whether they are per race or per weekend. 
function loadPrizes(filename, drives) {
  const raceCounts = drives.reduce((result, drive) => {
    const data = result[drive.race] || 0
    result[drive.race] = data + 1
    return result
  }, {})
  const raceCount = Object.keys(raceCounts).length

  const sponsorData = fs.readFileSync(filename).toString()
  const prizes = sponsorData.split('\n').reduce((result, line, index) => {
    if (index === 0) return result
    const [sponsor, type, races, perRace, perRaceCount, weekend, perWeekendCount, perWeekend] = line.split(',').map(value => value.trim())
    for (let race = 1; race <= raceCount; race++)
      for (let i = 0; i < perRaceCount; i++)
        result.push({ sponsor, type, frequency: 'race', race, amount: perRace })
    for (let i = 0; i < perWeekendCount; i++)
      result.push({ sponsor, type, frequency: 'weekend', amount: perWeekend })
    return result
  }, [])
  setToyoAmounts(prizes, raceCounts)
  // randomize the prizes to be won so we're not always picking in the same order. As we
  // we award prizes the pool of candidates shrinks so if we always did the prizes in the same order, 
  // you can game the system by, for example, leaving off stickers for sponsors you don't want and 
  // thus increasing your chances of winning one of the later prizes (you're more likely to be left 
  // in the pool).
  randomize(prizes)
  return prizes
}

function setToyoAmounts(prizes, raceCounts) {
  // 3-5: $85, 6-10: $175, 11-15: $265, 16-20: $355, 21-24: $440, 25-30: $550, 31+: $600.
  const countTable = [0, 0, 0, 85, 85, 85, 175, 175, 175, 175, 175, 265, 265, 265, 265, 265, 355, 355, 355, 355, 355, 440, 440, 440, 440, 550, 550, 550, 550, 550, 550, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600]
  prizes.forEach(prize => {
    if (prize.sponsor === 'Toyo') prize.amount = countTable[raceCounts[prize.race]]
  })
}

// Load a set of drives from the RaceHero results data file. This is hardcoded to the current data format so 
// must be updated if there are changes or a different data provider is used (e.g., the Mission races
// use some other system). Note that we also try to parse out the "event name" so it's easier to track and
// report the raffle results.
function loadRace(race, filename) {
  try {
    const resultsData = fs.readFileSync(filename).toString()
    const results = resultsData.split('\n').map(line => {
      const columns = line.split(',').map(value => value.replace(/^[\s\"]+/, '').replace(/[\s\"]+$/, ''))
      return { driver: columns[0], position: columns[1], number: columns[3], race, class: columns[4], gap: columns[9] }
    })
    const drives = results
      .filter(result => result.class === 'PRO3' && result.gap !== 'DNS')
      .map(result => { return { driver: result.driver, number: result.number, race: result.race } })

    const event = results[1].position
    return { event, drives }
  } catch (e) { return { event: null, drives: [] } }
}

// Load all the individual drives from a set of up to three race results from a weekend. Missing results
// files are ignored.
function loadDrives() {
  const results = loadRace(1, 'results1.csv')
  const event = results.event
  const drives = results.drives
  drives.push(...loadRace(2, 'results2.csv').drives)
  drives.push(...loadRace(3, 'results3.csv').drives)
  return { event, drives: drives.filter(Boolean) }
}

// Get the set of possible winners for a prize in a given set of drives in light of who has already won
// and which stickers they have displayed.
function getCandidates(drives, prize, awarded, winners, cars, previousWinners) {
  const result = drives.filter(drive =>
    (!prize.race || prize.race === drive.race)
    && hasSticker(cars, drive.number, prize.sponsor)
    && !winners.some(winner => winner.driver === drive.driver)
    && !(awarded.some(award => award.winner.driver === drive.driver && award.prize.sponsor === prize.sponsor))
    && !(prize.sponsor === 'Toyo' && hasWonToyo(drive.driver, previousWinners)))
  return result
}

function hasSticker(cars, number, sponsor) {
  const car = cars[number]
  const result = car && car[sponsor]
  return result
}

function hasWonToyo(driver, previousWinners) {
  // Drivers cannot have won in the previous 9 races. 9 is magic as it is raceCount / 2 + 1.
  // That means that no driver can win more then twice in a season.
  const windowSize = Math.min(previousWinners.length - 1, 9)
  const windowStart = previousWinners.length - windowSize
  for (let i = windowStart; i < previousWinners.length; i++) {
    for (let j = 0; j < previousWinners[i].length; j++) {
      const record = previousWinners[i][j]
      if (record.Toyo && record.Toyo === driver)
        return true
    }
  }
  return false
}

function validateCarsAndDrives(cars, drives) {
  const drivesMissingCars = drives.filter(drive => !cars[drive.number])
  if (drivesMissingCars.length)
    console.log(`Some drives were in an unknown car\n${JSON.stringify(drivesMissingCars, null, 2)}`)
}

function draw(awarded, prizes, drives, cars, previousWinners) {
  const winners = []
  const unawarded = []
  const results = prizes.reduce((result, prize) => {
    const candidates = getCandidates(drives, prize, awarded, winners, cars, previousWinners)
    if (!candidates.length) {
      // for whatever reason, there are no candidates (likely already exhausted the pool for this prize)
      // so just track the prize as unawarded and move on
      unawarded.push(prize)
      return result
    }
    const winnerIndex = Math.floor(Math.random() * candidates.length)
    const winner = candidates[winnerIndex]
    winners.push(winner)
    result.push({ prize, winner })
    return result
  }, [])
  return { awarded: results, unawarded }
}

function groupResults(results) {
  return results.reduce((result, entry) => {
    const { sponsor, type, race, amount } = entry.prize
    const frequencyText = race ? `(Race #${race})` : '(Weekend)'
    const key = `${sponsor.replace(/^_+/, '')} -- $${amount} ${type} ${frequencyText}`
    result[key] = result[key] || []
    if (entry.winner)
      result[key].push(entry.winner)
    return result
  }, {})
}

function presentResults(results) {
  const grouped = groupResults(results)
  const sorted = Object.keys(grouped).sort()
  sorted.forEach(key => {
    const winners = grouped[key]
    if (!winners || !winners.length)
      return console.log(`${key}: Unclaimed`)
    const winnersText = winners.map(winner => `${winner.driver} #${winner.number}`).join(', ')
    console.log(`${key}: ${winnersText}`)
  })
}

function summarizeRaffle(prizes, drives, awarded) {
  const winnerCounts = awarded.reduce((result, current) => {
    const driver = current.winner.driver
    result[driver] ? ++result[driver] : result[driver] = 1
    return result
  }, {})
  const drivers = Array.from(new Set(drives.map(drive => drive.driver)))
  console.log(`${prizes.length} prizes`)
  console.log(`${drives.length} drives by ${drivers.length} drivers`)
  console.log(`${Object.keys(winnerCounts).length} unique winners`)
  const realDupes = Object.keys(winnerCounts).reduce((result, key) => {
    if (winnerCounts[key] > 1)
      result[key] = winnerCounts[key]
    return result
  }, {})
  const sorted = Object.fromEntries(
    Object.entries(realDupes).sort((a, b) => a[1] - b[1])
  );
  console.log(`${Object.keys(sorted).length} duplicate winners`)
  if (Object.keys(sorted).length) console.log(JSON.stringify(sorted, null, 2))
}

function recordWinners(lastRace, previous, awarded) {
  const { byRace, weekend } = awarded.reduce((result, entry) => {
    if (entry.prize.frequency === 'weekend')
      result.weekend[entry.prize.sponsor] = entry
    else {
      const race = entry.prize.race + lastRace
      const raceEntry = result.byRace[race] = result.byRace[race] || {}
      raceEntry[entry.prize.sponsor] = raceEntry[entry.prize.sponsor] || []
      raceEntry[entry.prize.sponsor].push(entry)
    }
    return result
  }, { byRace: {}, weekend: {} })
  weekend['event'] = ''
  weekend['race'] = ''
  const columns = ['event', 'race', '_425', 'AAF', 'Aplinestars', 'Bimmerworld', 'Griots', 'ProFormance', 'Redline', 'RoR', 'Toyo']
  const weekendString = columns.map(column => weekend[column]
    ? `${weekend[column].winner.driver} (${weekend[column].prize.type})`
    : '').join(',')
  let final = previous + weekendString + '\n'
  for (const race in byRace)
    for (let i = 0; i < 4; i++) {
      const entry = byRace[race]
      entry.event = ''
      entry.race = i === 0 ? `Race ${race}` : ''
      const text = columns.map(column => {
        if (!Array.isArray(entry[column])) return entry[column]
        if (!entry[column][i]) return ''
        if (entry[column][i].winner) return `${entry[column][i].winner.driver} (${entry[column][i].prize.type})`
        return entry[column][i]
      }).join(',')
      final = final + text + '\n'
    }
  console.log(final)
  return final
}

// Load and validate the cars, drives, prizes and previous winners
const cars = loadCars('cars.csv')
const { event, drives } = loadDrives()
validateCarsAndDrives(cars, drives)
const prizes = loadPrizes('sponsors.csv', drives)
const { lastRace, winners } = loadWinners('winners.csv')

// do the drawing repeatedly until there all prizes are awarded. Repetition is likely when there are more
// prizes than drivers and/or cars do not sport all stickers.
let awarded = []
let unawarded = prizes
let round = 1
while (unawarded.length || round > 5) {
  console.log(`Running round ${round} for ${unawarded.length} prizes`)
  const { awarded: newlyAwarded, unawarded: remainingUnawarded } = draw(awarded, unawarded, drives, cars, winners)
  awarded.push(...newlyAwarded)
  unawarded = remainingUnawarded
  round++
}
if (unawarded.length) {
  console.log(`ERROR: Still could not award all prizes after ${round} rounds!`)
  exit(1)
}
summarizeRaffle(prizes, drives, awarded)
console.log('')
presentResults(awarded)
console.log('')
recordWinners(lastRace, event, awarded)

