const lodash = require("lodash")
const path = require("path")
const { TreeNode } = require("jtree/products/TreeNode.js")
const { Disk } = require("jtree/products/Disk.node.js")
const { Utils } = require("jtree/products/Utils.js")
const { shiftRight, removeReturnChars } = Utils
const ParserFile = new TreeNode(Disk.read(path.join(__dirname, "measures", "pldbMeasures.scroll")))
const listsFolder = path.join(__dirname, "lists")
const pagesDir = path.join(__dirname, "pages")
const numeral = require("numeral")

const cleanAndRightShift = str => Utils.shiftRight(Utils.removeReturnChars(str), 1)

const linkManyAftertext = links =>
  links.map((link, index) => `${index + 1}.`).join(" ") + // notice the dot is part of the link. a hack to make it more unique for aftertext matching.
  links.map((link, index) => `\n ${link} ${index + 1}.`).join("")

const delimiter = `|_$^`
const quickTree = (rows, header) => `table ${delimiter}
 ${new TreeNode(rows).toDelimited(delimiter, header, false).replace(/\n/g, "\n ")}`

// One feature maps to one Parser that extends abstractFeatureParser
class Feature {
  constructor(measure, computer) {
    this.measure = measure
    this.fileName = "pldbMeasures.scroll"
    this.id = measure.Name
    this.computer = computer
  }

  id = ""
  fileName = ""

  get permalink() {
    return this.id + ".html"
  }

  get yes() {
    return this.languagesWithThisFeature.length
  }

  get no() {
    return this.languagesWithoutThisFeature.length
  }

  get percentage() {
    const { yes, no } = this
    const measurements = yes + no
    return measurements < 100 ? "-" : lodash.round((100 * yes) / measurements, 0) + "%"
  }

  get aka() {
    return this.get("aka") // .join(" or "),
  }

  get token() {
    return this.get("tokenKeyword")
  }

  get titleLink() {
    return `../features/${this.permalink}`
  }

  get(word) {
    // todo; fix this
    // return this.measure[word]
    return this.node.getFrom(`string ${word}`)
  }

  get node() {
    return ParserFile.getNode(this.id + "Parser")
  }

  get title() {
    return this.get("title") || this.id
  }

  get pseudoExample() {
    return (this.get("pseudoExample") || "").replace(/\</g, "&lt;").replace(/\|/g, "&#124;")
  }

  get references() {
    return (this.get("reference") || "").split(" ").filter(i => i)
  }

  get languagesWithThisFeature() {
    const { id } = this
    return this.getLanguagesWithFeatureResearched(id).filter(file => file[id])
  }

  get languagesWithoutThisFeature() {
    const { id } = this
    return this.getLanguagesWithFeatureResearched(id).filter(file => !file[id])
  }

  getLanguagesWithFeatureResearched(id) {
    if (!this.computer.featureCache) this.computer.featureCache = {}
    if (this.computer.featureCache[id]) return this.computer.featureCache[id]
    // todo: re-add support for "extended"
    this.computer.featureCache[id] = this.computer.pldb.filter(file => file[id] !== "")
    return this.computer.featureCache[id]
  }

  get summary() {
    const { id, title, fileName, titleLink, aka, token, yes, no, percentage, pseudoExample } = this
    return {
      id,
      title,
      fileName,
      titleLink,
      aka,
      token,
      yes,
      no,
      measurements: yes + no,
      percentage,
      pseudoExample
    }
  }

  toScroll() {
    const { title, id, fileName, references, previous, next } = this

    const positives = this.languagesWithThisFeature
    const positiveText = `* Languages *with* ${title} include ${positives
      .map(file => `<a href="../concepts/${file.filename.replace(".scroll", ".html")}">${file.id}</a>`)
      .join(", ")}`

    const negatives = this.languagesWithoutThisFeature
    const negativeText = negatives.length
      ? `* Languages *without* ${title} include ${negatives
          .map(file => `<a href="../concepts/${file.filename.replace(".scroll", ".html")}">${file.id}</a>`)
          .join(", ")}`
      : ""

    const examples = positives
      .filter(file => this.computer.getConceptFile(file.filename).getNode(id).length)
      .map(file => {
        return {
          id: file.filename,
          title: file.id,
          example: this.computer.getConceptFile(file.filename).getNode(id).childrenToString()
        }
      })
    const grouped = lodash.groupBy(examples, "example")
    const examplesText = Object.values(grouped)
      .map(group => {
        const links = group.map(hit => `<a href="../concepts/${hit.id}.html">${hit.title}</a>`).join(", ")
        return `codeWithHeader Example from ${links}:
 ${shiftRight(removeReturnChars(lodash.escape(group[0].example)), 1)}`
      })
      .join("\n\n")

    let referencesText = ""
    if (references.length) referencesText = `* Read more about ${title} on the web: ${linkManyAftertext(references)}`

    let descriptionText = ""
    const description = this.measure.Description
    if (description) descriptionText = `* This question asks: ${description}`

    return `import header.scroll

title ${title}

title ${title} - language feature
 hidden

html
 <a class="trueBaseThemePreviousItem" href="${previous.permalink}">&lt;</a>
 <a class="trueBaseThemeNextItem" href="${next.permalink}">&gt;</a>

// viewSourceUrl https://github.com/breck7/pldb/blob/main/measures/${fileName}

thinColumns 4

${examplesText}

${positiveText}

${negativeText}

${descriptionText}

${referencesText}

HTML of this page generated by Features.ts
 https://github.com/breck7/pldb/blob/main/code/Features.ts Features.ts

endColumns

keyboardNav ${previous.permalink} ${next.permalink}

import ../footer.scroll
`.replace(/\n\n\n+/g, "\n\n")
  }
}

const getMostRecentInt = (concept, pathToSet) => {
  let set = concept.getNode(pathToSet)
  if (!set) return 0
  set = set.toObject()
  const key = Math.max(...Object.keys(set).map(year => parseInt(year)))
  return parseInt(set[key])
}

const getJoined = (row, keywords) => {
  const words = keywords
    .map(word => row[word] || "")
    .filter(i => i)
    .join(" ")
    .split(" ")
  return lodash.uniq(words).join(" ")
}

const groupByListValues = (listColumnName, rows, delimiter = " && ") => {
  const values = {}
  rows.forEach(row => {
    const value = row[listColumnName]
    if (!value) return
    value.split(delimiter).forEach(value => {
      if (!values[value]) values[value] = []
      values[value].push(row)
    })
  })
  return values
}

class Tables {
  constructor() {}

  get top1000() {
    return this.toTable(this.top.slice(0, 1000))
  }

  get all() {
    return this.toTable(this.top)
  }

  _cache = {}
  getConceptFile(filename) {
    if (!this._cache[filename])
      this._cache[filename] = new TreeNode(Disk.read(path.join(__dirname, "concepts", filename)))
    return this._cache[filename]
  }

  toTable(data) {
    const header = lodash.keys(data[0]).join("\t")
    const rows = lodash.map(data, row => lodash.values(row).join("\t"))
    const tsv = [header, ...rows].join("\n ")
    return "tabTable\n " + tsv
  }

  _top
  get top() {
    if (this._top) return this._top
    const { pldb } = this
    this._top = lodash
      .chain(pldb)
      .orderBy(["rank"], ["asc"])
      .map(row =>
        lodash.pick(row, [
          "id",
          "filename",
          "rank",
          "appeared",
          "type",
          "creators",
          "numberOfUsersEstimate",
          "numberOfJobsEstimate",
          "measurements"
        ])
      )
      .value()
      .map(row => {
        row.idLink = "../concepts/" + row.filename.replace(".scroll", ".html")
        delete row.filename
        return row
      })
    return this._top
  }

  get pldb() {
    return require("./pldb.json")
  }

  get measures() {
    return require("./measures.json")
  }

  get features() {
    const features = this.measures
      .filter(measure => measure.SortIndex === 42)
      .map(measure => {
        const feature = new Feature(measure, this)
        if (!feature.title) {
          throw new Error(`Feature ${measure} has no title.`)
        }
        return feature
      })

    let previous = features[features.length - 1]
    features.forEach((feature, index) => {
      feature.previous = previous
      feature.next = features[index + 1]
      previous = feature
    })
    features[features.length - 1].next = features[0]

    return features
  }

  getFeaturesImports(limit = 0) {
    const { features } = this
    const topFeatures = lodash.sortBy(features, "yes")
    topFeatures.reverse()
    const summaries = topFeatures.map(feature => feature.summary).filter(feature => feature.measurements >= limit)
    return {
      COUNT: numeral(summaries.length).format("0,0"),
      TABLE: quickTree(summaries, ["title", "titleLink", "pseudoExample", "yes", "no", "percentage"])
    }
  }

  get topFeaturesImports() {
    return this.getFeaturesImports(10)
  }

  get allFeaturesImports() {
    return this.getFeaturesImports(0)
  }

  writeAllFeaturePages() {
    this.features.forEach(feature => {
      Disk.write(path.join(__dirname, "features", feature.id + ".scroll"), feature.toScroll())
    })
  }

  get creators() {
    const entities = groupByListValues(
      "creators",
      this.pldb.filter(row => row.isLanguage),
      " and "
    )
    const wikipediaLinks = new TreeNode(Disk.read(path.join(listsFolder, "creators.tree")))

    const rows = Object.keys(entities).map(name => {
      const group = lodash.sortBy(entities[name], "languageRank")
      const person = wikipediaLinks.nodesThatStartWith(name)[0]
      const anchorTag = lodash.camelCase(name)

      return {
        name: !person
          ? `<a name='${anchorTag}' />${name}`
          : `<a name='${anchorTag}' href='https://en.wikipedia.org/wiki/${person.get("wikipedia")}'>${name}</a>`,
        languages: group
          .map(file => `<a href='../concepts/${file.filename.replace(".scroll", ".html")}'>${file.id}</a>`)
          .join(" - "),
        count: group.length,
        topRank: group[0].languageRank
      }
    })

    return {
      TABLE: quickTree(lodash.sortBy(rows, "topRank"), ["name", "languages", "count", "topRank"]),
      COUNT: numeral(Object.values(entities).length).format("0,0")
    }
  }

  get extensions() {
    const files = this.pldb
      .map(row => {
        row.extensions = getJoined(row, [
          "fileExtensions",
          "githubLanguage_fileExtensions",
          "pygmentsHighlighter_fileExtensions",
          "wikipedia_fileExtensions"
        ])
        return row
      })
      .filter(file => file.extensions)
      .map(file => {
        return {
          name: file.id,
          nameLink: `../concepts/${file.filename.replace(".scroll", ".html")}`,
          rank: file.rank,
          extensions: file.extensions
        }
      })

    const allExtensions = new Set()
    files.forEach(file => file.extensions.split(" ").forEach(ext => allExtensions.add(ext)))

    files.forEach(file => (file.numberOfExtensions = file.extensions.split(" ").length))

    return {
      EXTENSION_COUNT: numeral(allExtensions.size).format("0,0"),
      TABLE: quickTree(lodash.sortBy(files, "rank"), ["name", "nameLink", "extensions", "numberOfExtensions"]),
      LANG_WITH_DATA_COUNT: files.length
    }
  }

  get originCommunities() {
    const files = lodash.sortBy(
      this.pldb.filter(file => file.isLanguage && file.originCommunity.length),
      "languageRank"
    )

    const entities = groupByListValues("originCommunity", files)
    const rows = Object.keys(entities).map(name => {
      const group = entities[name]
      const languages = group.map(lang => `<a href='../concepts/${lang.id}.html'>${lang.id}</a>`).join(" - ")
      const count = group.length
      const top = -Math.min(...group.map(lang => lang.languageRank))

      const wrappedName = `<a name='${lodash.camelCase(name)}' />${name}`

      return { name: wrappedName, languages, count, top }
    })
    const sorted = lodash.sortBy(rows, ["count", "top"])
    sorted.reverse()

    return {
      TABLE: quickTree(sorted, ["count", "name", "languages"]),
      COUNT: numeral(Object.values(entities).length).format("0,0")
    }
  }

  get autocompleteJs() {
    const json = JSON.stringify(
      this.pldb.map(file => {
        const permalink = file.filename.replace(".scroll", "")
        return {
          label: file.id,
          id: permalink,
          url: `/concepts/${permalink}.html`
        }
      }),
      undefined,
      2
    )
    const js =
      Disk.read(path.join(__dirname, "browser", "autocompleter.js")) +
      "\n" +
      `var autocompleteJs = ` +
      json +
      "\n\n" +
      Disk.read(path.join(__dirname, "browser", "client.js"))
    return `plainText\n ` + js.replace(/\n/g, "\n ")
  }

  getFile(permalink) {
    return this.pldb.find(row => row.filename === permalink + ".scroll")
  }

  get acknowledgements() {
    const sources = this.measures.map(col => col.Source).filter(i => i)
    let writtenIn = [
      "javascript",
      "nodejs",
      "html",
      "css",
      "treenotation",
      "scroll",
      "grammar",
      "python",
      "bash",
      "markdown",
      "json",
      "typescript",
      "png-format",
      "svg",
      "explorer",
      "gitignore"
    ].map(s => this.getFile(s))

    const npmPackages = Object.keys({
      ...require("./package.json").dependencies
    })
    npmPackages.sort()

    return {
      WRITTEN_IN_TABLE: lodash
        .sortBy(writtenIn, "rank")
        .map(file => `- ${file.id}\n link ../concepts/${file.filename.replace(".scroll", ".html")}`)
        .join("\n"),
      PACKAGES_TABLE: npmPackages.map(s => `- ${s}\n https://www.npmjs.com/package/${s}`).join("\n"),
      SOURCES_TABLE: sources.map(s => `- ${s}\n https://${s}`).join("\n"),
      CONTRIBUTORS_TABLE: JSON.parse(Disk.read(path.join(pagesDir, "contributors.json")))
        .filter(item => item.login !== "codelani" && item.login !== "breck7" && item.login !== "pldbbot")
        .map(item => `- ${item.login}\n ${item.html_url}`)
        .join("\n")
    }
  }
}

const computeds = {
  numberOfUsersEstimate(concept) {
    const mostRecents = ["linkedInSkill", "subreddit memberCount", "projectEuler members"]
    const directs = ["meetup members", "githubRepo stars"]
    const customs = {
      wikipedia: v => 20,
      packageRepository: v => 1000, // todo: pull author number
      "wikipedia dailyPageViews": count => 100 * (parseInt(count) / 20), // say its 95% bot traffic, and 1% of users visit the wp page daily
      linguistGrammarRepo: c => 200, // According to https://github.com/github/linguist/blob/master/CONTRIBUTING.md, linguist indicates a min of 200 users.
      codeMirror: v => 50,
      website: v => 1,
      githubRepo: v => 1,
      "githubRepo forks": v => v * 3,
      annualReport: v => 1000
    }

    return Math.round(
      lodash.sum(mostRecents.map(key => getMostRecentInt(concept, key))) +
        lodash.sum(directs.map(key => parseInt(concept.get(key) || 0))) +
        lodash.sum(
          Object.keys(customs).map(key => {
            const val = concept.get(key)
            return val ? customs[key](val) : 0
          })
        )
    )
  },

  numberOfJobsEstimate(concept) {
    return Math.round(getMostRecentInt(concept, "linkedInSkill") * 0.01) + getMostRecentInt(concept, "indeedJobs")
  },

  exampleCount(concept) {
    return concept.topDownArray.filter(node => node.isExampleCode).length
  },

  score(concept) {},

  measurements(concept) {
    let count = 0
    concept.forEach(node => {
      if (node.isMeasure) count++
    })
    return count
  },

  bookCount(concept) {
    const gr = concept.getNode(`goodreads`)?.length
    const isbndb = concept.getNode(`isbndb`)?.length
    let count = 0
    if (gr) count += gr - 1
    if (isbndb) count += isbndb - 1
    return count
  },

  paperCount(concept) {
    const ss = concept.getNode(`semanticScholar`)?.length
    let count = 0
    if (ss) count += ss - 1
    return count
  },

  hoplId(concept) {
    const id = concept.get("hopl")?.replace("https://hopl.info/showlanguage.prx?exp=", "")
    return id === undefined ? "" : parseInt(id)
  },

  lastActivity(concept) {
    return lodash.max(concept.findAllWordsWithCellType("yearCell").map(word => parseInt(word.word)))
  },

  isLanguage(concept) {
    const nonLanguages = {
      vm: true,
      linter: true,
      library: true,
      webApi: true,
      characterEncoding: true,
      cloud: true,
      editor: true,
      filesystem: true,
      feature: true,
      packageManager: true,
      os: true,
      application: true,
      framework: true,
      standard: true,
      hashFunction: true,
      compiler: true,
      decompiler: true,
      binaryExecutable: true,
      binaryDataFormat: true,
      equation: true,
      interpreter: true,
      computingMachine: true,
      dataStructure: true
    }
    const type = concept.get("type")
    return nonLanguages[type] ? 0 : 1
  },

  rank(concept, computer) {
    return computer.ranks[concept.get("id")].index
  },
  languageRank(concept, computer) {
    return computeds.isLanguage(concept) ? computer.languageRanks[concept.get("id")].index : ""
  }
}

class Computer {
  constructor(scrollFile, concepts) {
    this.concepts = concepts
    this.ranks = calcRanks(concepts, this)
    this.languageRanks = calcRanks(
      concepts.filter(concept => computeds.isLanguage(concept)),
      this
    )
  }

  get(measureName, concept) {
    if (computeds[measureName]) {
      if (!concept[measureName]) concept[measureName] = computeds[measureName](concept, this)
      return concept[measureName]
    }
    return concept.get("appeared")
  }
}

const calcRanks = (concepts, computer) => {
  // const { pageRankLinks } = folder
  let objects = concepts.map(concept => {
    const id = concept.get("id")
    const object = {}
    object.id = id
    object.jobs = computer.get("numberOfJobsEstimate", concept)
    object.users = computer.get("numberOfUsersEstimate", concept)
    object.measurements = computer.get("measurements", concept)
    // object.pageRankLinks = pageRankLinks[id].length
    return object
  })

  objects = rankSort(objects, "jobs")
  objects = rankSort(objects, "users")
  objects = rankSort(objects, "measurements")
  // objects = rankSort(objects, "pageRankLinks")

  objects.forEach((obj, rank) => {
    // Drop the item this does the worst on, as it may be a flaw in PLDB.
    const top3 = [obj.jobsRank, obj.usersRank, obj.measurementsRank]
    obj.totalRank = lodash.sum(lodash.sortBy(top3).slice(0, 3))
  })
  objects = lodash.sortBy(objects, ["totalRank"])

  const ranks = {}
  objects.forEach((obj, index) => {
    obj.index = index + 1
    ranks[obj.id] = obj
  })
  return ranks
}

const rankSort = (objects, key) => {
  objects = lodash.sortBy(objects, [key])
  objects.reverse()
  let lastValue = objects[0][key]
  let lastRank = 0
  objects.forEach((obj, rank) => {
    const theValue = obj[key]
    if (lastValue === theValue) {
      // A tie
      obj[key + "Rank"] = lastRank
    } else {
      obj[key + "Rank"] = rank
      lastRank = rank
      lastValue = theValue
    }
  })
  return objects
}

const computeRankings = folder => {
  const ranks = calcRanks(folder, folder.getChildren())
  const inverseRanks = makeInverseRanks(ranks)
  const languageRanks = calcRanks(
    folder,
    folder.filter(file => file.isLanguage)
  )
  const inverseLanguageRanks = makeInverseRanks(languageRanks)

  return {
    ranks,
    inverseRanks,
    languageRanks,
    inverseLanguageRanks
  }
}

const makeInverseRanks = ranks => {
  const inverseRanks = {}
  Object.keys(ranks).forEach(id => {
    inverseRanks[ranks[id].index] = ranks[id]
  })
  return inverseRanks
}

module.exports = { Computer, Tables: new Tables() }
