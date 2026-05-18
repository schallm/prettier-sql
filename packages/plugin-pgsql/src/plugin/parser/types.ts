export interface SqlNode {
    type: string;
    startOffset: number;
    endOffset: number;
    text?: string;
    props?: Record<string, SqlNode | SqlNode[] | string | number | boolean | null | undefined | unknown[]>;
    trailingComment?: string;
    leadingComments?: string[];
    preBodyComments?: string[];
    postParamComments?: string[];
}

export interface CommentToken {
    type: 'line' | 'block';
    value: string;
    text: string;
    startOffset: number;
    endOffset: number;
}
