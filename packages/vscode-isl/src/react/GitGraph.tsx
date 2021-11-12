import React from 'react';
import { useSelector } from 'react-redux';

import gitGraphSlotAssignment from '../util/gitgraph-slot-assignment';
import getRelativeTimeDiffString from '../util/relative-time';
import { GitRefIcon } from './Icons';
import type { GlobalState } from './store';

const COLUMN_SIZE = 20;
const ROW_HEIGHT = 54;

const dotCoordinate = (order: number, column: number) => ({
  x: COLUMN_SIZE * (column + 1),
  y: (order + 0.5) * ROW_HEIGHT,
});

export default function GitGraph(): JSX.Element | null {
  const gitCommitData = useSelector((state: GlobalState) => state.gitCommitData);
  if (gitCommitData == null) return null;

  const commits = gitGraphSlotAssignment(gitCommitData.commits);
  const hashToCoordinateMap = Object.fromEntries(
    commits.map((it, order) => [it.hash, dotCoordinate(order, it.columnId)])
  );
  const numberOfColumns = commits.reduce((acc, c) => Math.max(acc, c.columnId), -1) + 1;

  const svgWidth = (numberOfColumns + 1) * COLUMN_SIZE;
  const svgHeight = 31 + commits.length * ROW_HEIGHT;
  const paths = commits.flatMap((commit) => {
    const origin = hashToCoordinateMap[commit.hash];
    return commit.parents.flatMap((parent) => {
      const destination = hashToCoordinateMap[parent];
      if (destination == null) return [];
      return [`M ${origin.x} ${origin.y} L ${destination.x} ${destination.y}`];
    });
  });

  const currentTimestamp = Math.round(new Date().getTime() / 1000);

  return (
    // @ts-expect-error: css custom variable
    <div id="commit-graph-table-container" style={{ '--svg-width': `${svgWidth}px` }}>
      <div className="commit-graph">
        <svg width={svgWidth} height={svgHeight}>
          <defs>
            <linearGradient id="GraphGradient">
              <stop stop-color="white" offset="1"></stop>
              <stop stop-color="black" offset="1"></stop>
            </linearGradient>
            <mask id="GraphMask">
              <rect fill="url(#GraphGradient)" width={svgWidth} height={svgHeight}></rect>
            </mask>
          </defs>
          <g mask="url(#GraphMask)">
            {paths.map((line, index) => (
              <path key={index} d={line} stroke="#666" />
            ))}
            {commits.map((commit, order) => {
              const { x, y } = dotCoordinate(order, commit.columnId);
              return <circle key={order} cx={x} cy={y} r="4" fill="rgb(62, 122, 226)"></circle>;
            })}
          </g>
        </svg>
      </div>
      <div>
        {commits.map((commit) => {
          const date = new Date(commit.date * 1000);
          const refs = [...commit.tags.map((it) => it.name), ...commit.heads];
          return (
            <div className="commit-entry">
              <div className="commit-summary" title={commit.message}>
                <span className="commit-description">
                  {refs.map((ref) => (
                    <span key={ref} className="git-ref-tag head">
                      {GitRefIcon}
                      <span className="git-ref-name">{ref}</span>
                    </span>
                  ))}
                  <span className="commit-entry-text">{commit.message}</span>
                </span>
              </div>
              <div className="commit-description">
                <div className="commit-avatar">
                  <div className="commit-avatar-body">
                    <img
                      className="commit-avatar-img"
                      src={`https://avatars.githubusercontent.com/u/e?email=${commit.email}&amp;s=64`}
                      aria-label={`Avatar for ${commit.author}`}
                    />
                  </div>
                </div>
                <div className="commit-byline">
                  <span className="commit-attribution-component">
                    <span className="authors">
                      <span className="author">{commit.author}</span>
                    </span>
                  </span>
                  {' • '}
                  <span title={date.toLocaleString()}>
                    {getRelativeTimeDiffString(currentTimestamp, commit.date)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
