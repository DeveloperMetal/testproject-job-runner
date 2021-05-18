# Simple TestProject Job Runner CLI Tool

Given a project id and job id, this cli tool can execute test project jobs and wait for their success/failure states:

```bash
> testproject-job-runner run --project_id <project id> --job_id <job id> --api_key <api key>
```

All three flags support loading values from the following environment variables:

| ENV | Description |
| - | - |
| TP_PROJECT_ID | The test project id. You can get this from the project page ui |
| TP_JOB_ID | The test project job id. You can get this from the project page ui |
| TP_API_KEY | The test project api key. You can get this from the integrations page |
