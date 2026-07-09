/**
 * Server-side git commit metadata qua GitHub REST API.
 *
 * Pattern: create blob → create tree → create commit → update ref.
 * Không cần git binary trên Vercel serverless — chỉ HTTP calls.
 *
 * Reference: plan synchronous-toasting-kahn.md (Approach A refined).
 *
 * Env: GITHUB_TOKEN (PAT có repo:write), GITHUB_REPO_OWNER, GITHUB_REPO_NAME.
 */

import { Octokit } from "@octokit/rest";
import { getGithubConfig } from "@/lib/datasets/types";

let _octokit: Octokit | null = null;

function getOctokit(): Octokit {
  if (_octokit) return _octokit;

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN missing trong .env.local — cần PAT có repo:write"
    );
  }

  _octokit = new Octokit({ auth: token });
  return _octokit;
}

export interface FileToCommit {
  /** Path trong repo (vd: "datasets/grdp-34-tinh/metadata.yaml") */
  path: string;
  /** File content (UTF-8 string — YAML/Markdown) */
  content: string;
  /** Unix permission mode: `100644` = regular file (mặc định). KHÔNG phải create/update semantic. */
  mode?: "100644";
  /** Git object type: `blob` = file text (mặc định) */
  type?: "blob";
}

export interface CommitResult {
  commitSha: string;
  commitUrl: string;
  message: string;
}

/**
 * Commit multiple file vào repo + push (update main ref).
 *
 * Atomic: tất cả files cùng 1 commit. Nếu 1 file fail → rollback (không update ref).
 *
 * @param files — danh sách file cần commit
 * @param commitMessage — commit message (vd: "Upload dataset grdp-34-tinh")
 */
export async function commitFiles(
  files: FileToCommit[],
  commitMessage: string
): Promise<CommitResult> {
  const config = getGithubConfig();
  const octokit = getOctokit();
  const { owner, repo, branch } = config;

  // 1. Get current HEAD commit SHA + tree SHA
  const refResponse = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const parentSha = refResponse.data.object.sha;

  const commitResponse = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: parentSha,
  });
  const baseTreeSha = commitResponse.data.tree.sha;

  // 2. Create blobs cho mỗi file
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const blob = await octokit.rest.git.createBlob({
        owner,
        repo,
        content: file.content,
        encoding: "utf-8",
      });
      return {
        path: file.path,
        mode: file.mode ?? "100644",
        type: file.type ?? "blob",
        sha: blob.data.sha,
      };
    })
  );

  // 3. Create tree từ base
  const treeResponse = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // 4. Create commit
  const newCommit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: treeResponse.data.sha,
    parents: [parentSha],
  });

  // 5. Update ref (push)
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.data.sha,
  });

  return {
    commitSha: newCommit.data.sha,
    commitUrl: newCommit.data.html_url,
    message: commitMessage,
  };
}

/**
 * Commit metadata.yaml + dictionary.md cho 1 dataset.
 * Helper wrapper cho commitFiles.
 */
export async function commitMetadataFiles(
  slug: string,
  metadataYaml: string,
  dictionaryMarkdown: string,
  commitMessage?: string
): Promise<CommitResult> {
  return commitFiles(
    [
      {
        path: `datasets/${slug}/metadata.yaml`,
        content: metadataYaml,
      },
      {
        path: `datasets/${slug}/dictionary.md`,
        content: dictionaryMarkdown,
      },
    ],
    commitMessage ?? `Upload dataset ${slug}`
  );
}

/**
 * Xóa metadata.yaml + dictionary.md của 1 dataset khỏi git repo.
 *
 * Pattern delete qua createTree: mỗi item cần path + mode + type + sha:null.
 * GitHub API dùng sha:null làm signal "mark deletion" — mode/type vẫn bắt buộc
 * (raw tree item schema yêu cầu, không optional như comment cũ ghi).
 *
 * @param slug — dataset slug
 * @returns CommitResult cho commit delete
 */
export async function deleteDatasetFiles(
  slug: string
): Promise<CommitResult> {
  const config = getGithubConfig();
  const octokit = getOctokit();
  const { owner, repo, branch } = config;

  const metadataPath = `datasets/${slug}/metadata.yaml`;
  const dictionaryPath = `datasets/${slug}/dictionary.md`;

  // 1. Verify files tồn tại (getContent) — skip nếu 404, không cần SHA cho delete
  const treeItems: Array<{
    path: string;
    mode: "100644";
    type: "blob";
    sha: null;
  }> = [];

  for (const filePath of [metadataPath, dictionaryPath]) {
    try {
      const contentResponse = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: branch,
      });

      // getContent trả array nếu path là directory, object nếu file.
      // Ở đây path là file cụ thể → object (có field sha).
      if (!Array.isArray(contentResponse.data) && "sha" in contentResponse.data) {
        treeItems.push({
          path: filePath,
          mode: "100644",
          type: "blob",
          sha: null, // null = signal delete cho GitHub createTree
        });
      }
    } catch (err) {
      // File không tồn tại (404) — skip, không cần delete
      console.warn(`[delete] File ${filePath} không tồn tại, skip:`, err);
    }
  }

  if (treeItems.length === 0) {
    throw new Error(
      `Không tìm thấy metadata.yaml hoặc dictionary.md cho slug: ${slug}`
    );
  }

  // 2. Lấy current HEAD commit SHA + tree SHA
  const refResponse = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const parentSha = refResponse.data.object.sha;

  const commitResponse = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: parentSha,
  });
  const baseTreeSha = commitResponse.data.tree.sha;

  // 3. Create tree với delete items (path + mode + type + sha:null = mark delete)
  const newTree = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // 4. Create commit
  const newCommit = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: `Delete dataset ${slug}`,
    tree: newTree.data.sha,
    parents: [parentSha],
  });

  // 5. Update ref (push)
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.data.sha,
  });

  return {
    commitSha: newCommit.data.sha,
    commitUrl: newCommit.data.html_url,
    message: `Delete dataset ${slug}`,
  };
}
