/* eslint-disable no-shadow */
/* Git Interfaces / Types */

export interface GitCommit {
  readonly hash: string;
  readonly parents: ReadonlyArray<string>;
  readonly author: string;
  readonly email: string;
  readonly date: number;
  readonly message: string;
  readonly heads: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<GitCommitTag>;
  readonly remotes: ReadonlyArray<GitCommitRemote>;
  readonly stash: GitCommitStash | null; // null => not a stash, otherwise => stash info
}

export interface GitCommitTag {
  readonly name: string;
  readonly annotated: boolean;
}

export interface GitCommitRemote {
  readonly name: string;
  readonly remote: string | null; // null => remote not found, otherwise => remote name
}

export interface GitCommitStash {
  readonly selector: string;
  readonly baseHash: string;
  readonly untrackedFilesHash: string | null;
}

export interface GitCommitDetails {
  readonly hash: string;
  readonly parents: ReadonlyArray<string>;
  readonly author: string;
  readonly authorEmail: string;
  readonly authorDate: number;
  readonly committer: string;
  readonly committerEmail: string;
  readonly committerDate: number;
  readonly body: string;
  readonly fileChanges: ReadonlyArray<GitFileChange>;
}

export enum GitConfigLocation {
  Local = 'local',
  Global = 'global',
  System = 'system',
}

export interface GitFileChange {
  readonly oldFilePath: string;
  readonly newFilePath: string;
  readonly type: GitFileStatus;
  readonly additions: number | null;
  readonly deletions: number | null;
}

export enum GitFileStatus {
  Added = 'A',
  Modified = 'M',
  Deleted = 'D',
  Renamed = 'R',
  Untracked = 'U',
}

export enum GitPushBranchMode {
  Normal = '',
  Force = 'force',
  ForceWithLease = 'force-with-lease',
}

export interface GitRepoConfig {
  readonly branches: GitRepoConfigBranches;
  readonly diffTool: string | null;
  readonly guiDiffTool: string | null;
  readonly pushDefault: string | null;
  readonly remotes: ReadonlyArray<GitRepoSettingsRemote>;
  readonly user: {
    readonly name: {
      readonly local: string | null;
      readonly global: string | null;
    };
    readonly email: {
      readonly local: string | null;
      readonly global: string | null;
    };
  };
}

export type GitRepoConfigBranches = { [branchName: string]: GitRepoConfigBranch };

export interface GitRepoConfigBranch {
  readonly pushRemote: string | null;
  readonly remote: string | null;
}

export interface GitRepoSettingsRemote {
  readonly name: string;
  readonly url: string | null;
  readonly pushUrl: string | null;
}

export enum GitResetMode {
  Soft = 'soft',
  Mixed = 'mixed',
  Hard = 'hard',
}

export interface GitStash {
  readonly hash: string;
  readonly baseHash: string;
  readonly untrackedFilesHash: string | null;
  readonly selector: string;
  readonly author: string;
  readonly email: string;
  readonly date: number;
  readonly message: string;
}

export interface GitTagDetails {
  readonly hash: string;
  readonly taggerName: string;
  readonly taggerEmail: string;
  readonly taggerDate: number;
  readonly message: string;
}

/* Extension Settings Types */

export enum BooleanOverride {
  Default,
  Enabled,
  Disabled,
}

export enum CommitDetailsViewLocation {
  Inline,
  DockedToBottom,
}

export enum CommitOrdering {
  Date = 'date',
  AuthorDate = 'author-date',
  Topological = 'topo',
}

export interface DateFormat {
  readonly type: DateFormatType;
  readonly iso: boolean;
}

export enum DateFormatType {
  DateAndTime,
  DateOnly,
  Relative,
}

export enum FileViewType {
  Default,
  Tree,
  List,
}

export enum GraphUncommittedChangesStyle {
  OpenCircleAtTheUncommittedChanges,
  OpenCircleAtTheCheckedOutCommit,
}

export enum RefLabelAlignment {
  Normal,
  BranchesOnLeftAndTagsOnRight,
  BranchesAlignedToGraphAndTagsOnRight,
}

export enum RepoCommitOrdering {
  Default = 'default',
  Date = 'date',
  AuthorDate = 'author-date',
  Topological = 'topo',
}

export enum TagType {
  Annotated,
  Lightweight,
}

/* Base Interfaces for Request / Response Messages */

export type ErrorInfo = string | null; // null => no error, otherwise => error message

/** Helper Types */

type PrimitiveTypes = string | number | boolean | symbol | bigint | undefined | null;

/**
 * Make all properties in T writeable
 */
export type Writeable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * Make all properties in T recursively readonly
 */
export type DeepReadonly<T> = T extends PrimitiveTypes
  ? T
  : T extends Array<infer U> | ReadonlyArray<infer U>
  ? ReadonlyArray<DeepReadonly<U>>
  : { readonly [K in keyof T]: DeepReadonly<T[K]> };

/**
 * Make all properties in T recursively writeable
 */
export type DeepWriteable<T> = T extends PrimitiveTypes
  ? T
  : T extends Array<infer U> | ReadonlyArray<infer U>
  ? Array<DeepWriteable<U>>
  : { -readonly [K in keyof T]: DeepWriteable<T[K]> };
