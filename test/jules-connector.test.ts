import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runJulesSessionTool } from '../src/lib/agent/tools';

// Mock du client Jules
vi.mock('@google/jules', () => ({
  JulesClient: vi.fn().mockImplementation(() => ({
    createSession: vi.fn().mockResolvedValue({
      id: 'test-session-123',
      state: 'ACTIVE',
    }),
    getSession: vi.fn().mockResolvedValue({
      id: 'test-session-123',
      state: 'ACTIVE',
      outputs: [
        {
          pullRequest: {
            url: 'https://github.com/test/repo/pull/1',
            title: 'Test PR',
            description: 'Test description',
          },
        },
      ],
    }),
    streamActivities: vi.fn().mockImplementation(async function* () {
      yield {
        progressUpdated: {
          title: 'Step 1',
          description: 'Starting work',
        },
      };
      yield {
        sessionCompleted: {},
      };
    }),
  })),
}));

describe('Jules Connector Fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requireApproval fix', () => {
    it('should create session with requireApproval: false', async () => {
      const mockContext = {
        sendIntermediateResult: vi.fn(),
      };

      // Mock pour capturer les paramètres passés à createSession
      const mockCreateSession = vi.fn().mockResolvedValue({
        id: 'test-session-123',
        state: 'ACTIVE',
      });
      
      // Remplacer le mock pour capturer les arguments
      const JulesClient = require('@google/jules').JulesClient;
      const mockInstance = new JulesClient();
      mockInstance.createSession = mockCreateSession;

      await runJulesSessionTool.execute(
        {
          prompt: 'Test task',
          githubRepository: 'test/repo',
          baseBranch: 'main',
          autoPr: true,
        },
        mockContext as any
      );

      // Vérifier que createSession a été appelé avec requireApproval: false
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Test task',
          source: 'sources/github/test/repo',
          githubRepoContext: {
            startingBranch: 'main',
          },
          automationMode: 'AUTO_CREATE_PR',
          requireApproval: false, // ← LA CORRECTION CRITIQUE
        })
      );
    });

    it('should handle session creation errors', async () => {
      const mockContext = {
        sendIntermediateResult: vi.fn(),
      };

      const JulesClient = require('@google/jules').JulesClient;
      const mockInstance = new JulesClient();
      mockInstance.createSession = vi.fn().mockRejectedValue(
        new Error('Could not get source')
      );

      await expect(
        runJulesSessionTool.execute(
          {
            prompt: 'Test task',
            githubRepository: 'test/repo',
            baseBranch: 'main',
            autoPr: true,
          },
          mockContext as any
        )
      ).rejects.toThrow('Failed to run Jules session: Could not get source');
    });

    it('should return PR URL when autoPr is true', async () => {
      const mockContext = {
        sendIntermediateResult: vi.fn(),
      };

      const result = await runJulesSessionTool.execute(
        {
          prompt: 'Test task',
          githubRepository: 'test/repo',
          baseBranch: 'main',
          autoPr: true,
        },
        mockContext as any
      );

      expect(result).toEqual(
        expect.objectContaining({
          sessionId: 'test-session-123',
          status: 'ACTIVE',
          activitiesCount: 2,
          pullRequestUrl: 'https://github.com/test/repo/pull/1',
          message: expect.stringContaining('Session completed successfully!'),
        })
      );
    });

    it('should handle invalid repository format', async () => {
      const mockContext = {
        sendIntermediateResult: vi.fn(),
      };

      await expect(
        runJulesSessionTool.execute(
          {
            prompt: 'Test task',
            githubRepository: 'invalid-format',
            baseBranch: 'main',
            autoPr: true,
          },
          mockContext as any
        )
      ).rejects.toThrow('Invalid GitHub repository format. Expected "owner/repo".');
    });
  });
});