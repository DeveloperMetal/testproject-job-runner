#!/usr/bin/env node
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import axios from 'axios';

/**
 * The testproject rest api url
 */
const TP_API_URL = "https://api.testproject.io"

/**
 * Default maximum requests to issue before considering requests as timed out.
 */
const MAX_REQUESTS = 60;

/**
 * Returns a promise to pause code execution for a certain amount of time in milliseconds.
 * @param {*} timeout 
 */
const sleep = (timeout) => {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  })
}

/**
 * Wraps an exception thrown by axios to minimize scaffolding code to retrieve error data.
 * @param {*} err 
 */
const axiosError = (err) => {
  if ( err.response ) {
    console.log(err.response.data);
    console.log(err.response.status);
    console.log(err.response.headers);
  } else if ( err.request ) {
    console.log(error.request);
  } else {
    console.log(err.message);
  }
}

/**
 * Simple wrapper over testproject rest api to fetch information about jobs as well as trigger runs.
 */
class TestProjectRunner {
  constructor(apiKey) {
    this.axios = axios.create({
      baseURL: TP_API_URL,
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
        "Accept": 'application/json'
      }
    });
  }

  /**
   * Returns details about a currently running job. Shows browser, test and steps currently running.
   * @param {*} projectId The project id. Get this id from the project page. Click "Copy ID"
   * @param {*} jobId The job id. Get this id from the project page sidebar. Click "Copy ID"
   * @param {*} executionId The execution id returned when a job is started.
   */
  async jobStatus(projectId, jobId, executionId) {
    return await this.axios.get(`/v2/projects/${projectId}/jobs/${jobId}/executions/${executionId}/state`);
  }
  
  /**
   * Returns job detail metadata.
   * @param {*} projectId The project id. Get this id from the project page. Click "Copy ID"
   * @param {*} jobId The job id. Get this id from the project page sidebar. Click "Copy ID"
   */
  async jobDetails(projectId, jobId) {
    return await this.axios.get(`/v2/projects/${projectId}/jobs/${jobId}`);
  }

  /**
   * Returns agent details attached to a job.
   * @param {*} projectId The project id. Get this id from the project page. Click "Copy ID"
   * @param {*} jobId The job id. Get this id from the project page sidebar. Click "Copy ID"
   */
  async jobAgentDetails(projectId, jobId) {
    return await this.axios.get(`/v2/projects/${projectId}/jobs/${jobId}/agent`);
  }
  
  /**
   * Triggers a job to run
   * @param {*} projectId The project id. Get this id from the project page. Click "Copy ID"
   * @param {*} jobId The job id. Get this id from the project page sidebar. Click "Copy ID"
   * @param {*} queue If true will set the queue flag on the execution so it runs after other runs have finished.
   */
  async runJob(projectId, jobId, queue) {
    return await this.axios.post(`/v2/projects/${projectId}/jobs/${jobId}/run`, {
      ...( queue ? {queue}:{} )
    });
  }

  /**
   * Returns true of false whether a job is currently running.
   * [Unfinished] It appears testproject doesn't have an api to check specific projects.
   *              Instead there you can get a list of executions but no feedback on specific job
   *              without an execution id.
   * @param {*} projectId The project id. Get this id from the project page. Click "Copy ID"
   * @param {*} jobId The job id. Get this id from the project page sidebar. Click "Copy ID"
   */
  async isJobExecuting(projectId, jobId) {
    try {
      const executions = await this.axios.get(`/v2/executions`);
      console.log(executions.data);
    } catch (err) {
      if ( err.response && err.response.status == "404" ) {
        // nothing executing atm.
        return false;
      } else {
        axiosError(err);
      }
    }
    //const exec = executions.body.filter((x) => x.project.id == projectId && x)

    return false;
  }

  /**
   * Similar to runJob method. However this method will loop over jobStatus request until the job
   * has been completed.
   * @param {*} projectId The project id. Get this id from the project page. Click "Copy ID"
   * @param {*} jobId The job id. Get this id from the project page sidebar. Click "Copy ID"
   * @param {*} queue Set to true to queue job and run after previous run is completed.
   * @param {*} maxRetries Maximum number of requests to issue before exiting with error.
   * @param {*} verbose Set to true to print out more information about every request.
   */
  async runJobAndWait(projectId, jobId, queue, maxRetries, verbose) {
    // make sure job exists
    let details = null;
    try {
      details = await this.jobDetails(projectId, jobId);
    } catch (err) {
      axiosError(err);
      return { error: "Could not retrieve job details...", success: false };
    }

    if ( verbose ) {
      console.log("Job: ", details.data);
    }

    let exec = null;
    try {
      exec = await this.runJob(projectId, jobId);
      if ( verbose ) {
        console.log("Job Started: ", exec.data.id);
      }
    } catch (err) {
      axiosError(err);
      return { error: "Could not start job...", success: false };
    }

    let retries = 0;
    do {

      let status = null;
      try {
        status = await this.jobStatus(projectId, jobId, exec.data.id);
      } catch (err) {
        axiosError(err);
        return { error: "Could not monitor job...", success: false }
      }

      if ( verbose ) {
        console.log(status.data);
      }

      if ( status.data.state === "Failed" ) {
        return { 
          error: "Test failed.",
          reportUrl: status.data.report,
          success: false
        };
      } else if ( status.data.state == "Error" ) {
        return { 
          error: "Failed due to error.",
          reportUrl: status.data.report,
          success: false
        };
      } else if ( status.data.state === "Passed" ) {
        return {
          success: true,
          reportUrl: status.data.report
        };
      }

      await sleep(10000);
      retries++;
    } while(retries < maxRetries)

    return { error: "Job Status Timed out...", success: false }
  }
}

yargs(hideBin(process.argv))
  .command(
    'run',
    'Run a job given its id and project id.',
    (yargs) => {
      return yargs
        .option('project-id', {
          describe: 'The test project id. You may set an environmental variable to preset this: TP_PROJECT_ID',
          type: "string",
          default: process.env.TP_PROJECT_ID || undefined,
          required: process.env.TP_PROJECT_ID?false:true
        })
        .option('job-id', {
          describe: 'The test project job id. You may set an environmental variable to preset this: TP_JOB_ID',
          type: "string",
          default: process.env.TP_JOB_ID || undefined,
          required: process.env.TP_JOB_ID?false:true
        })
        .option('api-key', {
          describe: 'The test project account opensdk api key. You may set an environmental variable to preset this: TP_API_KEY',
          type: "string",
          default: process.env.TP_API_KEY || undefined,
          required: process.env.TP_API_KEY?false:true
        })
        .option('max-requests', {
          describe: "Maximum number of requests before forcefully exiting with error.",
          type: "number",
          default: MAX_REQUESTS
        })
    }, async (argv) => {
      if ( argv.verbose ) {
        console.log("- Project: ", argv.projectId);
        console.log("- Job:     ", argv.jobId);
        console.log("-------------------------------")
      }

      const runner = new TestProjectRunner(argv.apiKey);
      const result = await runner.runJobAndWait(argv.projectId, argv.jobId, true, argv.maxRequests || MAX_REQUESTS, argv.verbose);
      if ( argv.verbose ) {
        console.log(result);
      }

      if ( result.reportUrl ) {
        console.log(result.reportUrl);
      }

      if ( result.success ) {
        process.exit(0);
      } else {
        console.error(result.error);
        process.exit(1);
      }
    })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Outputs more detailed information about requests.'
  })
  .argv

