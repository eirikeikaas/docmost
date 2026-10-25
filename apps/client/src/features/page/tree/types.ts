export type SpaceTreeNode = {
  id: string;
  slugId: string;
  name: string;
  icon?: string;
  position: string;
  spaceId: string;
  parentPageId: string;
  hasChildren: boolean;
  isBase?: boolean;
  artifactUrl?: string | null;
  isCollection?: boolean;
  canEdit?: boolean;
  children: SpaceTreeNode[];
};
