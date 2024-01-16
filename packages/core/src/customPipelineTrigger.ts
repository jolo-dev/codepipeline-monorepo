import type { EventPattern } from 'aws-cdk-lib/aws-events';
import { CodeCommitClient, GetDifferencesCommand } from '@aws-sdk/client-codecommit';
import { CodePipelineClient, StartPipelineExecutionCommand } from '@aws-sdk/client-codepipeline';

// Little helper to reveal the interfaces which extends another interface
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

interface CodeCommitStateChangeEvent extends EventPattern {
  detail: {
    callerUserArn: string;
    commitId: string;
    oldCommitId: string;
    event: string;
    referenceFullName: string;
    referenceName: string;
    referenceType: string;
    repositoryId: string;
    repositoryName: string;
  };
}

const stacksPath = 'stacks';
const packages = 'packages';
const commonFolder = ['stacks/PipelineStack', `${packages}/core`];

const PipelinePath = {
  backend: [`${packages}/backend`, `${stacksPath}/BackendStack.ts`, ...commonFolder],
  frontend: [`${packages}/frontend`, `${stacksPath}/FrontendStack.ts`, ...commonFolder],
};

const Pipeline = {
  frontend: 'FrontendStackPipeline',
  backend: 'BackendStackPipeline',
};

const codecommitClient = new CodeCommitClient({});
const codepipelineClient = new CodePipelineClient({});

export async function handler(event: Prettify<CodeCommitStateChangeEvent>) {
  // Use the SDK to get the difference from the new commit and previous commit
  const getDifferences = new GetDifferencesCommand({
    repositoryName: event.detail.repositoryName,
    afterCommitSpecifier: event.detail.commitId,
    beforeCommitSpecifier: event.detail.oldCommitId,
  });
  const codecommit = await codecommitClient.send(getDifferences);

  // iterate over the paths in PipelinePath to check which pipeline should be triggered
  // e.g. if the path includes functions/src/Application, then trigger the AppPipeline
  for (const path in PipelinePath) {
    const typePath = path as keyof typeof Pipeline;
    const pipeline = Pipeline[typePath];

    if (codecommit.differences) {
      const check = codecommit.differences.some((difference) => {
        return PipelinePath[typePath].some((substring) => {
          // Check if the path includes the substring
          return difference.afterBlob?.path?.includes(substring);
        });
      });

      if (check) {
        console.log('trigger pipeline', pipeline);
        const triggerPipelineCommand = new StartPipelineExecutionCommand({
          name: pipeline,
        });
        await codepipelineClient.send(triggerPipelineCommand);
      }
    }
  }
}
