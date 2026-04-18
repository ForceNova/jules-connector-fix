import { z } from 'zod';
import { Tool } from '../types';
import { JulesClient } from '@google/jules'; // ou l'import approprié

export const runJulesSessionTool: Tool = {
  name: 'run_jules_session',
  description: 'Launch a Google Jules coding session and return progress plus the resulting PR URL when available.',
  parameters: z.object({
    prompt: z.string().describe('Task prompt sent to Jules.'),
    githubRepository: z.string().describe('GitHub repository in owner/repo format.'),
    baseBranch: z.string().default('main').describe('Base branch for Jules work.'),
    autoPr: z.boolean().default(true).describe('Whether Jules should automatically create a pull request.'),
  }),
  async execute({ prompt, githubRepository, baseBranch, autoPr }, context) {
    try {
      const [owner, repo] = githubRepository.split('/');
      if (!owner || !repo) {
        throw new Error('Invalid GitHub repository format. Expected "owner/repo".');
      }

      // Initialiser le client Jules
      const jules = new JulesClient({
        apiKey: process.env.JULES_API_KEY,
        // autres configurations...
      });

      // CORRECTION : Ajouter requireApproval: false
      const session = await jules.createSession({
        prompt,
        source: `sources/github/${owner}/${repo}`,
        githubRepoContext: {
          startingBranch: baseBranch,
        },
        automationMode: autoPr ? 'AUTO_CREATE_PR' : 'NO_AUTOMATION',
        title: prompt.substring(0, 100), // titre basé sur le prompt
        requireApproval: false, // ← CORRECTION CRITIQUE
      });

      // Attendre que la session soit active
      let sessionStatus = await jules.getSession(session.id);
      const maxAttempts = 30; // 30 * 2s = 1 minute max
      let attempts = 0;

      while (sessionStatus.state === 'PENDING' && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Attendre 2 secondes
        sessionStatus = await jules.getSession(session.id);
        attempts++;
      }

      if (sessionStatus.state === 'PENDING') {
        throw new Error('Session timed out waiting for approval.');
      }

      // Streamer les activités
      const activities = [];
      const activityStream = await jules.streamActivities(session.id);
      
      for await (const activity of activityStream) {
        activities.push(activity);
        
        // Retourner les mises à jour de progression
        if (activity.progressUpdated) {
          context.sendIntermediateResult({
            type: 'progress',
            title: activity.progressUpdated.title,
            description: activity.progressUpdated.description,
          });
        }
        
        // Vérifier si la session est terminée
        if (activity.sessionCompleted) {
          break;
        }
      }

      // Récupérer les outputs (PR, etc.)
      const finalSession = await jules.getSession(session.id);
      const outputs = finalSession.outputs || [];

      // Trouver l'URL de la PR si elle existe
      const prOutput = outputs.find(output => output.pullRequest);
      const prUrl = prOutput?.pullRequest?.url;

      return {
        sessionId: session.id,
        status: finalSession.state,
        activitiesCount: activities.length,
        pullRequestUrl: prUrl || null,
        message: prUrl 
          ? `Session completed successfully! PR created: ${prUrl}`
          : `Session completed without creating a PR.`,
      };

    } catch (error) {
      throw new Error(`Failed to run Jules session: ${error.message}`);
    }
  },
};