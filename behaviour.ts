// Code based on behavior3js by Renato de Pontes Pereira

export namespace bt {
    export const enum Status {
        FAILURE = -1, SUCCESS = 1, RUNNING = 0
    }

    export class BehaviourTree {
        private static maxID: number = 0;
        id: number;

        constructor(private root: Node) {
            this.id = BehaviourTree.maxID++;
        }

        tick(target: any, context: Context): Status {
            let tick = new Tick(target, context, this),
                status = this.root.execute(tick),
                lastOpen = context.get<Node[]>('open', this),
                currentOpen = tick.open,
                start = 0;

            for (let i = 0; i < Math.min(lastOpen.length, currentOpen.length); i++) {
                start++;
                if (lastOpen[i] !== currentOpen[i]) {
                    break;
                }
            }

            for (let i = start; i < lastOpen.length; i++) {
                lastOpen[i].close(tick);
            }

            context.set('open', currentOpen, this);
            context.set('count', tick.count, this);

            return status;
        }
    }

    export class Node {
        private static maxID: number = 0;
        id: number;

        constructor() {
            this.id = Node.maxID++;
        }

        execute(tick: Tick): Status {
            if (!tick.context.get<boolean>('opened', tick.tree, this)) {
                this.open(tick);
            }

            let status = this.tick(tick);

            if (status === Status.RUNNING) {
                tick.open.push(this);
            } else {
                this.close(tick);
            }

            return status;
        }

        tick(tick: Tick): Status {
            return Status.SUCCESS;
        }

        open(tick: Tick) {
            tick.context.set('opened', true, tick.tree, this);
        }

        close(tick: Tick) {
            // TODO: Add removing item from context
            tick.context.set('opened', false, tick.tree, this);
        }
    }

    export class Context {
        private global: {} = {};
        private tree: {} = {};

        private getMemory(tree?: BehaviourTree, node?: Node): {} {
            if (tree === undefined) {
                return this.global;
            }
            let memory = this.tree[tree.id];
            if (memory === undefined) {
                this.tree[tree.id] = memory = {
                    node: {},
                    open: [],
                    depth: 0,
                    cycle: 0
                };
            }
            if (node === undefined) {
                return memory;
            }
            if (memory[node.id] === undefined) {
                memory = memory[node.id] = {};
            }
            return memory;
        }

        get<T>(key: string, tree?: BehaviourTree, node?: Node): T {
            return this.getMemory(tree, node)[key];
        }

        set<T>(key: string, value: T, tree?: BehaviourTree, node?: Node) {
            this.getMemory(tree, node)[key] = value;
        }
    }

    export class Tick {
        open: Node[] = [];
        count: number = 0;

        constructor(public target: any, public context: Context, public tree: BehaviourTree) {};
    }

    export class Composite extends Node {
        constructor(protected children: Node[]) {
            super();
        }
    }

    export class Decorator extends Node {
        constructor(protected child: Node) {
            super();
        }
    }

    export class Sequence extends Composite {
        tick(tick: Tick): Status {
            for (let child of this.children) {
                let status = child.execute(tick);

                if (status !== Status.SUCCESS) {
                    return status;
                }
            }
            return Status.SUCCESS;
        }
    }

    export class  RunningSequence extends Composite {
        open(tick: Tick) {
            super.open(tick);
            tick.context.set('running', 0, tick.tree, this);
        }

        tick(tick: Tick): Status {
            let idx = tick.context.get<number>('running', tick.tree, this);
            for (let i = idx; i < this.children.length; i++) {
                let status = this.children[i].execute(tick);

                if (status !== Status.SUCCESS) {
                    if (status === Status.RUNNING) {
                        tick.context.set('running', i, tick.tree, this);
                    }
                    return status;
                }
            }
            return Status.SUCCESS;
        }
    }

    export class Selector extends Composite {
        tick(tick: Tick): Status {
            for (let child of this.children) {
                let status = child.execute(tick);

                if (status !== Status.FAILURE) {
                    return status;
                }
            }
            return Status.FAILURE;
        }
    }

    export class RunningSelector extends Composite {
        open(tick: Tick) {
            super.open(tick);
            tick.context.set('running', 0, tick.tree, this);
        }

        tick(tick: Tick): Status {
            let idx = tick.context.get<number>('running', tick.tree, this);

            for (let i = idx; i < this.children.length; i++) {
                let status = this.children[i].execute(tick);

                if (status !== Status.FAILURE) {
                    if (status === Status.RUNNING) {
                        tick.context.set('running', i, tick.tree, this);
                    }
                    return status;
                }
            }
            return Status.FAILURE;
        }
    }

    export class Inverter extends Decorator {
        tick(tick: Tick): Status {
            let status = this.child.execute(tick);

            switch (status) {
                case Status.SUCCESS:
                    return Status.FAILURE;
                case Status.FAILURE:
                    return Status.SUCCESS;
                default:
                    return status;
            }
        }
    }

    export class Succeeder extends Decorator {
        tick(tick: Tick): Status {
            this.child.execute(tick);
            return Status.SUCCESS;
        }
    }

    export class Failer extends Decorator {
        tick(tick: Tick): Status {
            this.child.execute(tick);
            return Status.FAILURE;
        }
    }
}