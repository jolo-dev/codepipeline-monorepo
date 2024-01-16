import { StackContext } from 'sst/constructs';
import { CrossAccountPipelineStack } from './CrossAccountPipelineStack';
import { accounts } from './accounts';

export function MultiPipelineStack({ stack }: StackContext) {
  new CrossAccountPipelineStack(stack, 'FrontendPipelineStack', {
    accounts,
    purpose: 'frontend',
  });

  new CrossAccountPipelineStack(stack, 'BackendPipelineStack', {
    accounts,
    purpose: 'backend',
  });
}
