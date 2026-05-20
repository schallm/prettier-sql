export interface SqlNode {
    type: string;
    startOffset: number;
    endOffset: number;
    text?: string;
    props?: Record<string, SqlNode | SqlNode[] | string | number | boolean | null | undefined | unknown[]>;
    trailingComment?: string;
    leadingComments?: string[];
    /** Comments between the statement header (name/options) and the parameter list or body. */
    preBodyComments?: string[];
    /** Comments after the last parameter but before the body start (AS/BEGIN). */
    postParamComments?: string[];
}

export interface CommentToken {
    type: 'line' | 'block';
    value: string;
    text: string;
    startOffset: number;
    endOffset: number;
}
