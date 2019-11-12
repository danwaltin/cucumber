import { messages } from 'cucumber-messages'

export default class CucumberQuery {
  private readonly testStepResultsByUriAndLine = new Map<
    string,
    messages.ITestResult[]
  >()
  private readonly testCaseResultsByUriAndLine = new Map<
    string,
    messages.ITestResult[]
  >()
  private readonly documentResultsByUri = new Map<
    string,
    messages.ITestResult[]
  >()
  private readonly testStepMatchArgumentsByUriAndLine = new Map<
    string,
    messages.IStepMatchArgument[]
  >()

  private readonly testCaseStartedById = new Map<
    string,
    messages.ITestCaseStarted
  >()
  private readonly testCaseById = new Map<string, messages.ITestCase>()
  private readonly pickleById = new Map<string, messages.IPickle>()
  private readonly testStepById = new Map<string, messages.TestCase.ITestStep>()
  private readonly pickleStepById = new Map<
    string,
    messages.Pickle.IPickleStep
  >()
  private readonly gherkinStepById = new Map<
    string,
    messages.GherkinDocument.Feature.IStep
  >()
  private readonly uriByGherkinStep = new Map<
    messages.GherkinDocument.Feature.IStep,
    string
  >()
  private readonly locationsById = new Map<string, messages.ILocation>()

  public update(message: messages.IEnvelope): CucumberQuery {
    if (message.gherkinDocument && message.gherkinDocument.feature) {
      for (const featureChild of message.gherkinDocument.feature.children) {
        if (featureChild.background) {
          this.updateBackground(
            featureChild.background,
            message.gherkinDocument.uri
          )
        }

        if (featureChild.scenario) {
          this.updateScenario(
            featureChild.scenario,
            message.gherkinDocument.uri
          )
        }

        if (featureChild.rule) {
          const ruleChildren = featureChild.rule.children
          for (const ruleChild of ruleChildren) {
            if (ruleChild.background) {
              this.updateBackground(
                ruleChild.background,
                message.gherkinDocument.uri
              )
            }

            if (ruleChild.scenario) {
              this.updateScenario(
                ruleChild.scenario,
                message.gherkinDocument.uri
              )
            }
          }
        }
      }
    }

    if (message.pickle) {
      this.pickleById.set(message.pickle.id, message.pickle)
      for (const pickleStep of message.pickle.steps) {
        this.pickleStepById.set(pickleStep.id, pickleStep)
      }
    }

    if (message.testCase) {
      this.testCaseById.set(message.testCase.id, message.testCase)
      const pickle = this.pickleById.get(message.testCase.pickleId)

      for (const testStep of message.testCase.testSteps) {
        this.testStepById.set(testStep.id, testStep)

        const pickleStep = this.pickleStepById.get(testStep.pickleStepId)
        const gherkinStep = this.gherkinStepById.get(pickleStep.stepId)

        const uri = this.uriByGherkinStep.get(gherkinStep)
        const lineNumber = gherkinStep.location.line

        this.testStepMatchArgumentsByUriAndLine.set(
          `${uri}:${lineNumber}`,
          testStep.stepMatchArguments
        )
      }
    }

    if (message.testCaseStarted) {
      this.testCaseStartedById.set(
        message.testCaseStarted.id,
        message.testCaseStarted
      )
    }

    if (message.testStepFinished) {
      const testStep = this.testStepById.get(
        message.testStepFinished.testStepId
      )
      const pickleStep = this.pickleStepById.get(testStep.pickleStepId)
      const gherkinStep = this.gherkinStepById.get(pickleStep.stepId)

      const uri = this.uriByGherkinStep.get(gherkinStep)
      const lineNumber = gherkinStep.location.line

      let testStepResults = this.testStepResultsByUriAndLine.get(
        `${uri}:${lineNumber}`
      )
      if (testStepResults === undefined) {
        testStepResults = []
        this.testStepResultsByUriAndLine.set(
          `${uri}:${lineNumber}`,
          testStepResults
        )
      }
      testStepResults.push(message.testStepFinished.testResult)
    }

    if (message.testCaseFinished) {
      const testCaseStarted = this.testCaseStartedById.get(
        message.testCaseFinished.testCaseStartedId
      )
      const testCase = this.testCaseById.get(testCaseStarted.testCaseId)

      const pickle = this.pickleById.get(testCase.pickleId)

      const uri = pickle.uri
      const lineNumbers = pickle.sourceIds.map(
        sourceId => this.locationsById.get(sourceId).line
      )

      for (const lineNumber of lineNumbers) {
        let testCaseResults = this.testCaseResultsByUriAndLine.get(
          `${uri}:${lineNumber}`
        )
        if (testCaseResults === undefined) {
          testCaseResults = []
          this.testCaseResultsByUriAndLine.set(
            `${uri}:${lineNumber}`,
            testCaseResults
          )
        }
        testCaseResults.push(message.testCaseFinished.testResult)
      }
      let documentResults = this.documentResultsByUri.get(uri)
      if (!documentResults) {
        documentResults = []
        this.documentResultsByUri.set(uri, documentResults)
      }
      documentResults.push(message.testCaseFinished.testResult)
    }

    return this
  }

  private updateBackground(
    background: messages.GherkinDocument.Feature.IBackground,
    url: string
  ) {
    for (const step of background.steps) {
      this.uriByGherkinStep.set(step, url)
      this.gherkinStepById.set(step.id, step)
    }
  }

  private updateScenario(
    scenario: messages.GherkinDocument.Feature.IScenario,
    uri: string
  ) {
    this.locationsById.set(scenario.id, scenario.location)

    for (const step of scenario.steps) {
      this.uriByGherkinStep.set(step, uri)
      this.gherkinStepById.set(step.id, step)
    }

    for (const examples of scenario.examples) {
      for (const tableRow of examples.tableBody) {
        this.locationsById.set(tableRow.id, tableRow.location)
      }
    }
  }

  public getStepResults(
    uri: string,
    lineNumber: number
  ): messages.ITestResult[] {
    return this.testStepResultsByUriAndLine.get(`${uri}:${lineNumber}`) || []
  }

  public getScenarioResults(
    uri: string,
    lineNumber: number
  ): messages.ITestResult[] {
    return this.testCaseResultsByUriAndLine.get(`${uri}:${lineNumber}`) || []
  }

  public getDocumentResults(uri: string): messages.ITestResult[] {
    const results = this.documentResultsByUri.get(uri) || []
    return results.sort((a, b) => b.status.valueOf() - a.status.valueOf())
  }

  public getStepMatchArguments(
    uri: string,
    lineNumber: number
  ): messages.IStepMatchArgument[] {
    return (
      this.testStepMatchArgumentsByUriAndLine.get(`${uri}:${lineNumber}`) || []
    )
  }
}
